import { useState, useCallback } from "react";
import { AppScreen, GameConfiguration, PlaylistMetrics, LoadingStep } from "@/types/game";
import LandingScreen from "@/components/screens/LandingScreen";
import LoadingScreen from "@/components/screens/LoadingScreen";
import GameScreen from "@/components/screens/GameScreen";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDefaultAssets } from "@/game/assets";

function extractPlaylistId(input: string): string | null {
  // Handle full Spotify URLs (including share links with ?si= params)
  const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  // Accept standalone playlist IDs (base-62, typically 22 chars but can vary)
  if (/^[a-zA-Z0-9]{15,}$/.test(input.trim())) return input.trim();
  return null;
}

const Index = () => {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [playlistId, setPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [gameConfig, setGameConfig] = useState<GameConfiguration | null>(null);
  const [score, setScore] = useState(0);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("spotify");

  const handleGenerate = useCallback(async (url: string) => {
    const id = extractPlaylistId(url);
    if (!id) {
      toast.error("Invalid Spotify playlist URL. Please paste a valid link.");
      return;
    }

    setPlaylistId(id);
    setScreen("loading");
    setLoadingStep("spotify");

    try {
      // Step 1: Analyze playlist with Spotify API
      const { data: metricsData, error: metricsError } = await supabase.functions.invoke("spotify-analyze", {
        body: { playlistId: id },
      });

      if (metricsError || !metricsData) {
        throw new Error(metricsError?.message || "Failed to analyze playlist");
      }

      const metrics = metricsData as PlaylistMetrics;
      setPlaylistName(metrics.playlistName || "My Playlist");
      setLoadingStep("gemini");

      // Step 2: Generate game config using real metrics
      const { data: geminiData, error: geminiError } = await supabase.functions.invoke("gemini-generate", {
        body: { playlistName: metrics.playlistName, metrics },
      });

      if (geminiError || !geminiData) {
        throw new Error(geminiError?.message || "Failed to generate game");
      }

      const config = geminiData as GameConfiguration;
      config.metrics = metrics; // Attach metrics for the engine
      setPlaylistName(config.title || metrics.playlistName);
      setLoadingStep("assets");

      // Step 3: Generate game assets from AI descriptions (or defaults)
      await new Promise((r) => setTimeout(r, 400));
      if (!config.assets || !config.assets.player || !config.assets.enemies?.length) {
        config.assets = getDefaultAssets(config.colorPalette);
      }

      setGameConfig(config);
      setLoadingStep("engine");

      // Step 4: Build game world
      await new Promise((r) => setTimeout(r, 800));
      setScreen("game");
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
      setScreen("landing");
    }
  }, []);

  const handleRestart = useCallback(() => {
    setScreen("landing");
    setPlaylistId("");
    setPlaylistName("");
    setGameConfig(null);
    setScore(0);
  }, []);

  if (screen === "loading") {
    return <LoadingScreen step={loadingStep} playlistName={playlistName || "Analyzing..."} />;
  }

  if (screen === "game" && gameConfig) {
    return (
      <GameScreen
        config={gameConfig}
        playlistName={playlistName}
        playlistId={playlistId}
        score={score}
        onScoreChange={setScore}
        onRestart={handleRestart}
      />
    );
  }

  return <LandingScreen onGenerate={handleGenerate} />;
};

export default Index;
