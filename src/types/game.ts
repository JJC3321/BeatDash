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

export type AssetShape = "circle" | "diamond" | "triangle" | "star" | "hexagon" | "crescent" | "bolt";

export interface SpriteDescription {
  shape: AssetShape;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  style: "solid" | "outlined" | "gradient" | "neon";
  eyes: boolean;
}

export interface PlatformDescription {
  style: "solid" | "gradient" | "striped" | "glowing";
  primaryColor: string;
  accentColor: string;
}

export interface BackgroundDescription {
  particleColor: string;
  particleShape: AssetShape;
  particleCount: number;
  starfield: boolean;
  ambientColor: string;
}

export interface AssetDescriptions {
  player: SpriteDescription;
  enemies: SpriteDescription[];
  collectible: SpriteDescription;
  platform: PlatformDescription;
  background: BackgroundDescription;
}

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
  metrics?: PlaylistMetrics; // Real Spotify audio features
  assets?: AssetDescriptions; // AI-generated visual asset descriptions
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

export type LoadingStep = "spotify" | "gemini" | "assets" | "engine";
