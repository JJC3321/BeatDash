import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not configured");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Spotify token error:", res.status, errText);
    throw new Error(`Failed to get Spotify access token: ${res.status}`);
  }
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { playlistId } = await req.json();
    if (!playlistId) throw new Error("Missing playlistId");

    const token = await getSpotifyToken();

    // Fetch playlist info
    // Fetch playlist basic info
    const playlistRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images,tracks.total`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!playlistRes.ok) {
      const errText = await playlistRes.text();
      console.error("Playlist fetch error:", playlistRes.status, errText);
      throw new Error(`Failed to fetch playlist: ${playlistRes.status}`);
    }
    const playlist = await playlistRes.json();

    // Fetch tracks separately using the tracks endpoint (more reliable)
    const tracksRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,duration_ms,popularity))`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!tracksRes.ok) {
      const errText = await tracksRes.text();
      console.error("Tracks fetch error:", tracksRes.status, errText);
      throw new Error(`Failed to fetch tracks: ${tracksRes.status}`);
    }
    const tracksData = await tracksRes.json();
    console.log("Tracks response keys:", Object.keys(tracksData), "items count:", tracksData?.items?.length);

    const trackItems = tracksData?.items || [];
    const tracks = trackItems.map((item: any) => item?.track).filter(Boolean).slice(0, 50);

    if (tracks.length === 0) throw new Error("No tracks found in playlist");

    const trackIds = tracks.map((t: any) => t.id).filter(Boolean);

    // Try audio features endpoint first, fall back to track metadata estimation
    let avgTempo = 120;
    let avgEnergy = 0.5;
    let avgValence = 0.5;
    let avgAcousticness = 0.3;
    let avgDanceability = 0.5;
    let avgLoudness = -8;

    try {
      const featuresRes = await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (featuresRes.ok) {
        const features = await featuresRes.json();
        const validFeatures = (features.audio_features || []).filter(Boolean);

        if (validFeatures.length > 0) {
          const avg = (key: string) =>
            validFeatures.reduce((sum: number, f: any) => sum + (f[key] || 0), 0) / validFeatures.length;

          avgTempo = Math.round(avg("tempo"));
          avgEnergy = Math.round(avg("energy") * 100) / 100;
          avgValence = Math.round(avg("valence") * 100) / 100;
          avgAcousticness = Math.round(avg("acousticness") * 100) / 100;
          avgDanceability = Math.round(avg("danceability") * 100) / 100;
          avgLoudness = Math.round(avg("loudness") * 10) / 10;
        } else {
          console.log("No valid audio features returned, using estimation from track metadata");
          throw new Error("empty features");
        }
      } else {
        const errText = await featuresRes.text();
        console.error("Audio features error:", featuresRes.status, errText);
        throw new Error("audio features unavailable");
      }
    } catch (featErr) {
      // Fallback: estimate metrics from track metadata (popularity, duration)
      console.log("Falling back to track metadata estimation");
      const avgPopularity = tracks.reduce((sum: number, t: any) => sum + (t.popularity || 50), 0) / tracks.length;
      const avgDurationMs = tracks.reduce((sum: number, t: any) => sum + (t.duration_ms || 200000), 0) / tracks.length;

      // Heuristic estimation based on popularity and duration
      // Popular tracks tend to be more energetic and danceable
      avgEnergy = Math.round((avgPopularity / 100) * 0.8 * 100 + 10) / 100;
      avgEnergy = Math.min(1, Math.max(0, avgEnergy));
      avgDanceability = Math.round((avgPopularity / 100) * 0.7 * 100 + 15) / 100;
      avgDanceability = Math.min(1, Math.max(0, avgDanceability));
      avgValence = Math.round((avgPopularity / 100) * 0.6 * 100 + 20) / 100;
      avgValence = Math.min(1, Math.max(0, avgValence));
      // Shorter songs tend to be faster tempo
      avgTempo = Math.round(80 + (300000 - Math.min(avgDurationMs, 300000)) / 300000 * 80);
      avgAcousticness = Math.round((1 - avgPopularity / 100) * 0.5 * 100) / 100;
      avgLoudness = -12 + (avgPopularity / 100) * 8;
    }

    const metrics = {
      playlistName: playlist.name,
      playlistImage: playlist.images?.[0]?.url || "",
      trackCount: playlist.tracks.total,
      avgTempo,
      avgEnergy,
      avgValence,
      avgAcousticness,
      avgDanceability,
      avgLoudness,
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("spotify-analyze error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
