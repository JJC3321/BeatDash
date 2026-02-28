import { motion } from "framer-motion";
import { Sparkles, Gamepad2, Check, Loader2, Music, Palette } from "lucide-react";
import { LoadingStep } from "@/types/game";

interface LoadingScreenProps {
  step: LoadingStep;
  playlistName: string;
}

const allSteps: { key: LoadingStep; label: string; icon: typeof Sparkles }[] = [
  { key: "spotify", label: "Analyzing your music...", icon: Music },
  { key: "gemini", label: "AI is designing your game...", icon: Sparkles },
  { key: "assets", label: "Generating game assets...", icon: Palette },
  { key: "engine", label: "Building your world...", icon: Gamepad2 },
];

const stepOrder: LoadingStep[] = ["spotify", "gemini", "assets", "engine"];

const LoadingScreen = ({ step, playlistName }: LoadingScreenProps) => {
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-secondary/10 blur-[100px] animate-pulse-glow" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 max-w-md w-full"
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 mb-8 text-center"
        >
          <h3 className="font-semibold text-foreground text-lg">{playlistName}</h3>
        </motion.div>

        <div className="space-y-4">
          {allSteps.map((s, i) => {
            const isComplete = i < currentIndex;
            const isCurrent = i === currentIndex;

            return (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.2 }}
                className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                  isCurrent ? "glass glow-primary" : isComplete ? "bg-primary/5" : "opacity-40"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isComplete
                      ? "bg-primary/20 text-primary"
                      : isCurrent
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span className={`font-medium ${isCurrent ? "text-foreground" : isComplete ? "text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
