import { useState } from "react";
import { motion } from "framer-motion";
import { Music, Sparkles, Gamepad2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LandingScreenProps {
  onGenerate: (url: string) => void;
}

const steps = [
  { icon: Music, label: "Analyze", desc: "We scan your playlist's vibe" },
  { icon: Sparkles, label: "AI Generate", desc: "Gemini designs a unique game" },
  { icon: Gamepad2, label: "Play", desc: "Jump into your custom world" },
];

const LandingScreen = ({ onGenerate }: LandingScreenProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onGenerate(url.trim());
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-secondary/10 blur-[120px] animate-pulse-glow" style={{ animationDelay: "1s" }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 max-w-2xl w-full text-center"
      >
        {/* Logo / Title */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-2"
        >
          <Gamepad2 className="w-16 h-16 mx-auto text-primary mb-4" />
        </motion.div>

        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
          <span className="text-gradient">Playlist</span>
          <br />
          <span className="text-foreground">to Game</span>
        </h1>

        <p className="text-muted-foreground text-lg md:text-xl mb-10 max-w-md mx-auto">
          Drop a Spotify playlist. AI builds you a game inspired by the music.
        </p>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-lg mx-auto mb-16">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Spotify playlist URL..."
            className="h-14 text-base bg-muted/50 border-border/50 placeholder:text-muted-foreground/50 focus-visible:ring-primary"
          />
          <Button
            type="submit"
            size="lg"
            className="h-14 px-8 glow-primary font-semibold text-base gap-2"
            disabled={!url.trim()}
          >
            Generate
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.15 }}
              className="glass rounded-xl p-6 text-center"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{step.label}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default LandingScreen;
