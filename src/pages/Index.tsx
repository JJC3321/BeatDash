import { useState, useCallback } from "react";
import { AppScreen, PlaylistMetrics, GameConfiguration } from "@/types/game";
import LandingScreen from "@/components/screens/LandingScreen";
import LoadingScreen from "@/components/screens/LoadingScreen";
import GameScreen from "@/components/screens/GameScreen";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function extractPlaylistId(input: string): string | null {
  // Handle full URLs like https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  // Handle bare IDs
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  return null;
}

const Index = () => {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [playlistMetrics, setPlaylistMetrics] = useState<PlaylistMetrics | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfiguration | null>(null);
  const [score, setScore] = useState(0);
  const [loadingStep, setLoadingStep] = useState<"spotify" | "gemini" | "engine">("spotify");

  const handleGenerate = useCallback(async (url: string) => {
    const playlistId = extractPlaylistId(url);
    if (!playlistId) {
      toast.error("Invalid Spotify playlist URL. Please check and try again.");
      return;
    }

    setScreen("loading");
    setLoadingStep("spotify");

    try {
      // Step 1: Fetch playlist data
      const { data: spotifyData, error: spotifyError } = await supabase.functions.invoke("spotify-analyze", {
        body: { playlistId },
      });

      if (spotifyError || !spotifyData) {
        throw new Error(spotifyError?.message || "Failed to analyze playlist");
      }

      setPlaylistMetrics(spotifyData as PlaylistMetrics);
      setLoadingStep("gemini");

      // Step 2: Generate game config with AI
      const { data: geminiData, error: geminiError } = await supabase.functions.invoke("gemini-generate", {
        body: { metrics: spotifyData },
      });

      if (geminiError || !geminiData) {
        throw new Error(geminiError?.message || "Failed to generate game");
      }

      setGameConfig(geminiData as GameConfiguration);
      setLoadingStep("engine");

      // Step 3: Brief pause for engine setup visual
      await new Promise((r) => setTimeout(r, 1200));

      setScreen("game");
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
      setScreen("landing");
    }
  }, []);

  const handleRestart = useCallback(() => {
    setScreen("landing");
    setPlaylistMetrics(null);
    setGameConfig(null);
    setScore(0);
  }, []);

  if (screen === "loading") {
    return <LoadingScreen step={loadingStep} metrics={playlistMetrics} />;
  }

  if (screen === "game" && gameConfig) {
    return (
      <GameScreen
        config={gameConfig}
        metrics={playlistMetrics!}
        score={score}
        onScoreChange={setScore}
        onRestart={handleRestart}
      />
    );
  }

  return <LandingScreen onGenerate={handleGenerate} />;
};

export default Index;
