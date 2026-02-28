import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, RotateCcw, Home, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameConfiguration } from "@/types/game";
import { createGame } from "@/game/engine";
import * as ex from "excalibur";

interface GameScreenProps {
  config: GameConfiguration;
  playlistName: string;
  playlistId: string;
  score: number;
  onScoreChange: (score: number) => void;
  onRestart: () => void;
}

const GameScreen = ({ config, playlistName, playlistId, score, onScoreChange, onRestart }: GameScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ex.Engine | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = createGame(canvasRef.current, config, {
      onScore: (s: number) => onScoreChange(s),
      onGameOver: (finalScore: number) => {
        onScoreChange(finalScore);
        setIsGameOver(true);
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [config]);

  const togglePause = useCallback(() => {
    if (!engineRef.current) return;
    if (isPaused) {
      engineRef.current.clock.start();
    } else {
      engineRef.current.clock.stop();
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-screen block"
      />

      {/* HUD Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between pointer-events-none">
        <div className="glass rounded-xl px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{playlistName}</p>
              <p className="text-sm font-bold text-foreground">{config.title}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="glass rounded-xl px-4 py-2">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-lg font-bold text-primary font-mono">{score}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePause}
            className="glass rounded-xl w-10 h-10"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Spotify Embed Player */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-auto z-10">
        <iframe
          src={`https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`}
          width="100%"
          height="80"
          style={{ maxWidth: 400, borderRadius: 12 }}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>

      {/* Pause Menu */}
      <AnimatePresence>
        {isPaused && !isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass rounded-2xl p-8 text-center max-w-sm w-full mx-4"
            >
              <h2 className="text-2xl font-bold text-foreground mb-6">Paused</h2>
              <div className="space-y-3">
                <Button onClick={togglePause} className="w-full gap-2">
                  <Play className="w-4 h-4" /> Resume
                </Button>
                <Button variant="outline" onClick={onRestart} className="w-full gap-2">
                  <Home className="w-4 h-4" /> New Playlist
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass rounded-2xl p-8 text-center max-w-sm w-full mx-4"
            >
              <Trophy className="w-16 h-16 text-accent mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-foreground mb-2">Game Over</h2>
              <p className="text-5xl font-bold text-primary font-mono mb-6">{score}</p>
              <div className="space-y-3">
                <Button onClick={onRestart} className="w-full gap-2">
                  <RotateCcw className="w-4 h-4" /> Try Another Playlist
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GameScreen;
