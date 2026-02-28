import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { metrics } = await req.json();
    if (!metrics) throw new Error("Missing playlist metrics");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Gemini API key not configured");

    const prompt = `You are a game designer AI. Based on the following Spotify playlist analysis, design a game configuration.

Playlist: "${metrics.playlistName}"
- Average Tempo: ${metrics.avgTempo} BPM
- Energy: ${metrics.avgEnergy} (0-1, higher = more energetic)
- Valence: ${metrics.avgValence} (0-1, higher = more positive/happy)
- Acousticness: ${metrics.avgAcousticness} (0-1, higher = more acoustic)
- Danceability: ${metrics.avgDanceability} (0-1, higher = more danceable)
- Loudness: ${metrics.avgLoudness} dB
- Track Count: ${metrics.trackCount}

Choose a game type and configure it:
- "platformer" for energetic/upbeat music (energy > 0.6, valence > 0.5)
- "dodge" for intense/high-energy music (energy > 0.7, valence < 0.5)  
- "collector" for calm/acoustic music (acousticness > 0.5, energy < 0.5)
- "runner" for rhythmic/danceable music (danceability > 0.6)

Return ONLY valid JSON matching this exact schema:
{
  "gameType": "platformer" | "dodge" | "collector" | "runner",
  "title": "creative game title based on playlist mood (max 30 chars)",
  "description": "one-sentence game description",
  "gravity": number between 0.5-2.0,
  "playerSpeed": number between 100-400,
  "spawnRateMs": number between 500-3000 (lower = harder),
  "difficulty": number 1-10,
  "colorPalette": {
    "background": "#hex color for background (dark)",
    "player": "#hex color for player",
    "enemies": "#hex color for enemies/obstacles",
    "collectibles": "#hex color for collectibles",
    "platforms": "#hex color for platforms",
    "accent": "#hex color for UI accents"
  },
  "enemyTypes": ["type1", "type2"],
  "backgroundTheme": "description of visual theme",
  "musicInfluence": "1-2 sentences explaining how the music influenced the game design"
}

Make the color palette feel cohesive and match the mood. Dark backgrounds only. Be creative with the title.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini");

    const gameConfig = JSON.parse(text);

    // Validate required fields
    const required = ["gameType", "title", "gravity", "playerSpeed", "spawnRateMs", "colorPalette"];
    for (const field of required) {
      if (!(field in gameConfig)) throw new Error(`Missing field: ${field}`);
    }

    // Clamp values
    gameConfig.gravity = Math.max(0.5, Math.min(2.0, gameConfig.gravity));
    gameConfig.playerSpeed = Math.max(100, Math.min(400, gameConfig.playerSpeed));
    gameConfig.spawnRateMs = Math.max(500, Math.min(3000, gameConfig.spawnRateMs));
    gameConfig.difficulty = Math.max(1, Math.min(10, gameConfig.difficulty || 5));

    return new Response(JSON.stringify(gameConfig), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
