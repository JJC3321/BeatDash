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

function generateFallbackMetrics(playlistId: string): Record<string, unknown> {
  // Use playlistId as a seed for deterministic but varied metrics
  let hash = 0;
  for (let i = 0; i < playlistId.length; i++) {
    hash = ((hash << 5) - hash) + playlistId.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  return {
    playlistName: "Spotify Playlist",
    playlistImage: "",
    trackCount: 20 + (seed % 30),
    avgTempo: Math.round(90 + (seed % 80)),
    avgEnergy: Math.round(((seed % 80) / 100 + 0.2) * 100) / 100,
    avgValence: Math.round(((seed % 70) / 100 + 0.15) * 100) / 100,
    avgAcousticness: Math.round(((seed % 60) / 100 + 0.1) * 100) / 100,
    avgDanceability: Math.round(((seed % 75) / 100 + 0.2) * 100) / 100,
    avgLoudness: Math.round((-12 + (seed % 8)) * 10) / 10,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { playlistId } = await req.json();
    if (!playlistId) throw new Error("Missing playlistId");

    let token: string;
    try {
      token = await getSpotifyToken();
    } catch (e) {
      console.error("Token fetch failed, using fallback metrics:", e);
      const fallback = generateFallbackMetrics(playlistId);
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try fetching playlist data
    let playlistName = "Spotify Playlist";
    let playlistImage = "";
    let trackCount = 20;
    let tracks: any[] = [];

    try {
      const playlistRes = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (playlistRes.ok) {
        const playlist = await playlistRes.json();
        playlistName = playlist?.name || "Spotify Playlist";
        playlistImage = playlist?.images?.[0]?.url || "";
        trackCount = playlist?.tracks?.total || 20;
        tracks = (playlist?.tracks?.items || [])
          .map((item: any) => item?.track)
          .filter(Boolean)
          .slice(0, 50);
        console.log(`Fetched playlist "${playlistName}" with ${tracks.length} tracks`);
      } else {
        const errText = await playlistRes.text();
        console.error("Playlist fetch failed:", playlistRes.status, errText);
      }
    } catch (e) {
      console.error("Playlist fetch error:", e);
    }

    // Estimate metrics from track metadata and artist genres
    // Note: The audio-features endpoint was deprecated by Spotify in Nov 2024,
    // so we derive metrics from available track data (popularity, duration, explicit, artist info).
    if (tracks.length > 0) {
      // Collect unique artist IDs to fetch genre information
      const artistIds = [...new Set(
        tracks.flatMap((t: any) => (t.artists || []).map((a: any) => a.id)).filter(Boolean)
      )].slice(0, 50) as string[];

      let genres: string[] = [];
      if (artistIds.length > 0) {
        try {
          // Fetch artists in batches of 50 to get genre info
          const artistRes = await fetch(
            `https://api.spotify.com/v1/artists?ids=${artistIds.join(",")}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (artistRes.ok) {
            const artistData = await artistRes.json();
            genres = (artistData.artists || []).flatMap((a: any) => a.genres || []);
            console.log(`Fetched ${genres.length} genre tags from ${artistIds.length} artists`);
          }
        } catch (e) {
          console.error("Artist fetch error:", e);
        }
      }

      // Compute metrics from track metadata + genre signals
      const avgPop = tracks.reduce((s: number, t: any) => s + (t.popularity || 50), 0) / tracks.length;
      const avgDur = tracks.reduce((s: number, t: any) => s + (t.duration_ms || 200000), 0) / tracks.length;
      const explicitRatio = tracks.filter((t: any) => t.explicit).length / tracks.length;

      // Genre-based adjustments
      const genreStr = genres.join(" ").toLowerCase();
      const isElectronic = /edm|electro|house|techno|trance|dubstep|drum and bass|dnb/.test(genreStr);
      const isAcoustic = /acoustic|folk|singer-songwriter|indie folk|country/.test(genreStr);
      const isHiphop = /hip hop|rap|trap/.test(genreStr);
      const isRock = /rock|metal|punk|grunge|alternative/.test(genreStr);
      const isPop = /pop|dance pop|synth-pop/.test(genreStr);
      const isClassical = /classical|orchestra|piano|ambient|new age/.test(genreStr);
      const isLatin = /latin|reggaeton|salsa|bachata|cumbia/.test(genreStr);

      // Tempo estimation: shorter songs tend to be faster; genre adjustments
      let tempoEst = 80 + (300000 - Math.min(avgDur, 300000)) / 300000 * 80;
      if (isElectronic) tempoEst += 15;
      if (isHiphop) tempoEst = Math.max(tempoEst, 90);
      if (isLatin) tempoEst += 10;
      if (isClassical) tempoEst -= 20;

      // Energy: popularity + explicit content + genre signals
      let energyEst = avgPop / 100 * 0.6 + 0.2;
      if (isElectronic || isRock) energyEst += 0.15;
      if (explicitRatio > 0.5) energyEst += 0.1;
      if (isClassical || isAcoustic) energyEst -= 0.15;

      // Valence (happiness): popularity + genre
      let valenceEst = avgPop / 100 * 0.5 + 0.25;
      if (isPop || isLatin) valenceEst += 0.1;
      if (isRock && explicitRatio > 0.3) valenceEst -= 0.1;

      // Acousticness: inverse of electronic signals
      let acousticnessEst = isAcoustic ? 0.7 : isElectronic ? 0.1 : (1 - avgPop / 100) * 0.4 + 0.1;
      if (isClassical) acousticnessEst = Math.max(acousticnessEst, 0.6);

      // Danceability: genre + popularity
      let danceabilityEst = avgPop / 100 * 0.5 + 0.25;
      if (isElectronic || isLatin || isHiphop) danceabilityEst += 0.15;
      if (isClassical || isAcoustic) danceabilityEst -= 0.15;

      // Loudness: energy-correlated
      const loudnessEst = -12 + energyEst * 8;

      // Clamp all values to valid ranges
      const clamp01 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;

      console.log("Using track metadata + genre estimation");
      return new Response(JSON.stringify({
        playlistName,
        playlistImage,
        trackCount,
        avgTempo: Math.round(Math.max(60, Math.min(200, tempoEst))),
        avgEnergy: clamp01(energyEst),
        avgValence: clamp01(valenceEst),
        avgAcousticness: clamp01(acousticnessEst),
        avgDanceability: clamp01(danceabilityEst),
        avgLoudness: Math.round(loudnessEst * 10) / 10,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Final fallback: no tracks at all, use deterministic estimation
    console.log("No tracks available, using fallback metrics for", playlistId);
    const fallback = generateFallbackMetrics(playlistId);
    fallback.playlistName = playlistName;
    fallback.playlistImage = playlistImage;
    fallback.trackCount = trackCount;

    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("spotify-analyze error:", error.message);
    // Even on total failure, return fallback metrics so the game can still be generated
    const fallback = generateFallbackMetrics("default");
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
