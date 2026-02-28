export interface PlaylistMetrics {
  playlistName: string;
  playlistImage: string;
  trackCount: number;
  avgTempo: number;
  avgEnergy: number;
  avgValence: number;
  avgAcousticness: number;
  avgDanceability: number;
  avgLoudness: number;
}

export type GameType = "platformer" | "dodge" | "collector" | "runner";

export interface GameConfiguration {
  gameType: GameType;
  title: string;
  description: string;
  gravity: number;
  playerSpeed: number;
  spawnRateMs: number;
  difficulty: number; // 1-10
  colorPalette: {
    background: string;
    player: string;
    enemies: string;
    collectibles: string;
    platforms: string;
    accent: string;
  };
  enemyTypes: string[];
  backgroundTheme: string;
  musicInfluence: string; // AI's reasoning
}

export type AppScreen = "landing" | "loading" | "game";

export interface AppState {
  screen: AppScreen;
  playlistUrl: string;
  playlistMetrics: PlaylistMetrics | null;
  gameConfig: GameConfiguration | null;
  score: number;
  isGameOver: boolean;
}

export type LoadingStep = "spotify" | "gemini" | "engine";
