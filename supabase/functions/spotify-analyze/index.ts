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

  if (!res.ok) throw new Error("Failed to get Spotify access token");
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
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images,tracks.total,tracks.items(track(id))`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!playlistRes.ok) throw new Error("Failed to fetch playlist");
    const playlist = await playlistRes.json();

    const trackIds = playlist.tracks.items
      .map((item: any) => item.track?.id)
      .filter(Boolean)
      .slice(0, 50); // max 100 for audio features

    if (trackIds.length === 0) throw new Error("No tracks found in playlist");

    // Fetch audio features
    const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!featuresRes.ok) throw new Error("Failed to fetch audio features");
    const features = await featuresRes.json();

    const validFeatures = features.audio_features.filter(Boolean);

    const avg = (key: string) =>
      validFeatures.reduce((sum: number, f: any) => sum + (f[key] || 0), 0) / validFeatures.length;

    const metrics = {
      playlistName: playlist.name,
      playlistImage: playlist.images?.[0]?.url || "",
      trackCount: playlist.tracks.total,
      avgTempo: Math.round(avg("tempo")),
      avgEnergy: Math.round(avg("energy") * 100) / 100,
      avgValence: Math.round(avg("valence") * 100) / 100,
      avgAcousticness: Math.round(avg("acousticness") * 100) / 100,
      avgDanceability: Math.round(avg("danceability") * 100) / 100,
      avgLoudness: Math.round(avg("loudness") * 10) / 10,
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
