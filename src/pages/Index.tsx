import { useState, useCallback } from "react";
import { AppScreen, GameConfiguration } from "@/types/game";
import LandingScreen from "@/components/screens/LandingScreen";
import LoadingScreen from "@/components/screens/LoadingScreen";
import GameScreen from "@/components/screens/GameScreen";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function extractPlaylistId(input: string): string | null {
  const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  return null;
}

const Index = () => {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [playlistId, setPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [gameConfig, setGameConfig] = useState<GameConfiguration | null>(null);
  const [score, setScore] = useState(0);
  const [loadingStep, setLoadingStep] = useState<"gemini" | "engine">("gemini");

  const handleGenerate = useCallback(async (url: string) => {
    const id = extractPlaylistId(url);
    if (!id) {
      toast.error("Invalid Spotify playlist URL. Please paste a valid link.");
      return;
    }

    setPlaylistId(id);
    // Use the URL slug as a rough playlist name for the AI
    const nameFromUrl = url.split("/").pop()?.split("?")[0] || "My Playlist";
    setPlaylistName(nameFromUrl);
    setScreen("loading");
    setLoadingStep("gemini");

    try {
      const { data: geminiData, error: geminiError } = await supabase.functions.invoke("gemini-generate", {
        body: { playlistName: nameFromUrl },
      });

      if (geminiError || !geminiData) {
        throw new Error(geminiError?.message || "Failed to generate game");
      }

      setGameConfig(geminiData as GameConfiguration);
      setPlaylistName(geminiData.title || nameFromUrl);
      setLoadingStep("engine");

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
    setPlaylistId("");
    setPlaylistName("");
    setGameConfig(null);
    setScore(0);
  }, []);

  if (screen === "loading") {
    return <LoadingScreen step={loadingStep} playlistName={playlistName} />;
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
