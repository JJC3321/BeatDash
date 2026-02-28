/**
 * Simple Geometry Dash asset preloader.
 * Loads real GD sprite PNGs as HTMLImageElement objects so they can be
 * drawn directly via ctx.drawImage() inside excalibur ex.Canvas callbacks.
 */

const BASE = "/assets/geometry-dash";

/** All asset paths keyed by a short name the engine uses */
const ASSET_MANIFEST: Record<string, string> = {
  // Player cubes (just the default for now)
  playerCube: `${BASE}/sprites/Player (Cube)/player_00-hd.png`,
  // Cubes spritesheet
  cubesSheet: `${BASE}/sprites/cubes.png`,
  // Ground tiles
  ground_0: `${BASE}/grounds/Grounds/groundSquare_01_001-hd.png`,
  ground_1: `${BASE}/grounds/Grounds/groundSquare_02_001-hd.png`,
  ground_2: `${BASE}/grounds/Grounds/groundSquare_03_001-hd.png`,
  ground_3: `${BASE}/grounds/Grounds/groundSquare_04_001-hd.png`,
  ground_4: `${BASE}/grounds/Grounds/groundSquare_05_001-hd.png`,
  // Backgrounds
  bg_0: `${BASE}/backgrounds/Backgrounds/game_bg_color_blue.png`,
  bg_1: `${BASE}/backgrounds/Backgrounds/game_bg_color_green.png`,
  bg_2: `${BASE}/backgrounds/Backgrounds/game_bg_color_purple.png`,
  bg_3: `${BASE}/backgrounds/Backgrounds/game_bg_color_red.png`,
  bg_4: `${BASE}/backgrounds/Backgrounds/game_bg_color_orange.png`,
  // Portals spritesheet
  portals: `${BASE}/portals/portals.png`,
  // Obstacles / triggers spritesheet
  triggers: `${BASE}/obstacles/triggers.png`,
};

/** Loaded HTMLImageElements, keyed the same way as ASSET_MANIFEST */
const loaded: Map<string, HTMLImageElement> = new Map();
let _ready = false;

/** Load a single image and resolve when complete (or reject) */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/**
 * Preload all GD assets.  Call once before the game starts.
 * Assets that fail to load are silently skipped — procedural
 * fallbacks in assets.ts handle the missing entries.
 */
export async function preloadGDAssets(): Promise<void> {
  const entries = Object.entries(ASSET_MANIFEST);
  const results = await Promise.allSettled(
    entries.map(async ([key, src]) => {
      const img = await loadImg(src);
      loaded.set(key, img);
    })
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[GD Assets] Loaded ${ok}/${entries.length} assets`);
  _ready = true;
}

/** Get a loaded image by key.  Returns undefined if not yet loaded or failed. */
export function getGDImage(key: string): HTMLImageElement | undefined {
  return loaded.get(key);
}

/** True once preloadGDAssets() has finished (even if some assets failed). */
export function gdAssetsReady(): boolean {
  return _ready;
}

/** Return the list of keys that loaded successfully */
export function getLoadedKeys(): string[] {
  return Array.from(loaded.keys());
}
