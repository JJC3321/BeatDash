import * as ex from "excalibur";
import { GameConfiguration, TrackInfoWithMap, AssetDescriptions, SongMap, MapPattern, TrackInfo } from "@/types/game";
import {
  renderPlatform,
  renderSpike,
  renderBlock,
  renderGeoDashPlayer,
  renderSprite,
  addBackgroundParticles,
  getDefaultAssets,
} from "@/game/assets";
import { mapGenerator } from "./mapGenerator";
import { preloadGDAssets, getGDImage } from "@/game/geometryDashAssets";
import { getPremadeMap } from "@/game/premadeMaps";

// ─── Types ───────────────────────────────────────────────────────

interface GameCallbacks {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
  onSongChange?: (track: TrackInfo, index: number) => void;
}

interface TrackParams {
  scrollSpeed: number;
  gravity: number;
  jumpForce: number;
  spikeChance: number;
  blockChance: number;
  gapChance: number;
  doubleChance: number;
  spawnInterval: number;
  obstacleColor: string;
  obstacleGlow: string;
}

const BACKGROUND_SWITCH_INTERVAL_MS = 10_000;
const GEOMETRY_DASH_BACKGROUND_KEYS = ["bg_0", "bg_1", "bg_2", "bg_3", "bg_4"] as const;

// ─── Helpers ─────────────────────────────────────────────────────

function getAssets(config: GameConfiguration): AssetDescriptions {
  return config.assets || getDefaultAssets(config.colorPalette);
}

function trackToParams(track: TrackInfo, config: GameConfiguration): TrackParams {
  const energy = track.energy;
  const tempo = track.tempo;
  const valence = track.valence;
  const dance = track.danceability;
  const acoustic = track.acousticness;

  const baseSpeed = config.playerSpeed || 250;
  const scrollSpeed = baseSpeed * (0.6 + energy * 0.6) * (tempo / 120);
  const gravity = 1800 * config.gravity * (1.1 - acoustic * 0.5);
  const jumpForce = -900 - energy * 200;

  const spikeChance = 0.3 + energy * 0.4;
  const blockChance = 0.15 + (1 - valence) * 0.25;
  const gapChance = 0.1 + energy * 0.2;
  const doubleChance = energy > 0.6 ? 0.15 + (energy - 0.6) * 0.5 : 0;

  const beatMs = 60000 / tempo;
  const spawnInterval = Math.max(400, beatMs * (dance > 0.6 ? 1.0 : 1.5 - energy * 0.5));

  const obstacleColor = config.colorPalette.enemies;
  const obstacleGlow = config.colorPalette.accent;

  return {
    scrollSpeed: Math.max(150, Math.min(500, scrollSpeed)),
    gravity: Math.max(800, Math.min(2800, gravity)),
    jumpForce: Math.max(-1400, Math.min(-600, jumpForce)),
    spikeChance,
    blockChance,
    gapChance,
    doubleChance,
    spawnInterval: Math.max(500, Math.min(2000, spawnInterval)),
    obstacleColor,
    obstacleGlow,
  };
}

function defaultTrack(): TrackInfo {
  return {
    id: "default",
    name: "Unknown Track",
    artist: "Unknown",
    durationMs: 180000,
    popularity: 50,
    explicit: false,
    energy: 0.5,
    tempo: 120,
    valence: 0.5,
    danceability: 0.5,
    acousticness: 0.3,
  };
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

// ─── Main entry ──────────────────────────────────────────────────

export function createGame(
  canvas: HTMLCanvasElement,
  config: GameConfiguration,
  callbacks: GameCallbacks
): ex.Engine {
  const engine = new ex.Engine({
    canvasElement: canvas,
    width: canvas.clientWidth || 800,
    height: canvas.clientHeight || 600,
    backgroundColor: ex.Color.fromHex(config.colorPalette.background),
    suppressPlayButton: true,
    fixedUpdateFps: 60,
  });

  let score = 0;
  const addScore = (points: number) => {
    score += points;
    callbacks.onScore(score);
  };
  const gameOver = () => {
    callbacks.onGameOver(score);
  };

  // Preload GD assets, then set up the game.
  // If preloading fails the render functions fall back to procedural drawing.
  preloadGDAssets()
    .catch((err) => console.warn("[GD Assets] preload error (using fallbacks):", err))
    .finally(() => {
      setupGeoDash(engine, config, addScore, gameOver, callbacks);
    });

  return engine;
}

// ─── Geometry Dash Auto-Runner ───────────────────────────────────

function setupGeoDash(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void,
  callbacks: GameCallbacks
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const assets = getAssets(config);
  const W = engine.drawWidth;
  const H = engine.drawHeight;
  const GROUND_H = 24;
  const GROUND_Y = H - GROUND_H / 2;
  const PLAYER_SIZE = 32;
  const PLAYER_X = 120;

  const MIN_OBSTACLE_GAP = 80;
  const DEFAULT_SPAWN_X = W + 60;

  // ── Track management with map support ──
  const tracks: TrackInfoWithMap[] =
    config.tracks && config.tracks.length > 0 ? config.tracks : [defaultTrack() as TrackInfoWithMap];
  let currentTrackIndex = 0;
  let trackElapsedMs = 0;
  let params = trackToParams(tracks[0], config);
  let nextParams: TrackParams | null = null;
  let transitioning = false;
  let transitionProgress = 0;
  const TRANSITION_MS = 2000;
  
  // Map generation state
  let currentMap: SongMap | null = null;
  let currentPatternIndex = 0;
  let patternProgress = 0;
  let mapBasedSpawning = false;
  let preloadStarted = false;

  function clearObstacles() {
    for (const ob of obstacles) {
      if (!ob.isKilled()) ob.kill();
    }
    obstacles.length = 0;
    jumpedObstacles.clear();
    spawnAccumulator = 0;
    collectibleAccum = 0;
  }

  function switchToTrack(index: number) {
    if (index >= tracks.length) index = 0;
    currentTrackIndex = index;
    trackElapsedMs = 0;
    const track = tracks[currentTrackIndex];
    nextParams = trackToParams(track, config);
    transitioning = true;
    transitionProgress = 0;
    
    clearObstacles();
    loadTrackMapWithFallback(track);
    
    if (callbacks.onSongChange) {
      callbacks.onSongChange(track, currentTrackIndex);
    }
  }

  function loadTrackMapWithFallback(track: TrackInfoWithMap) {
    // Validate track data before processing
    if (!track || !track.id || !track.name) {
      console.error(`Failed to load track map: Invalid track data`, track);
      mapBasedSpawning = false;
      return;
    }

    // Try to get cached map first
    let map = mapGenerator.getCachedMap(track.id);
    
    if (map) {
      // Use cached map immediately
      currentMap = map;
      currentPatternIndex = 0;
      patternProgress = 0;
      mapBasedSpawning = true;
      console.log(`Loaded cached map for ${track.name} with ${map.patterns.length} patterns`);
      return;
    }

    const fallbackMap = getPremadeMap(track.id, track.durationMs);
    currentMap = fallbackMap;
    currentPatternIndex = 0;
    patternProgress = 0;
    mapBasedSpawning = true;
    console.log(`Loaded pre-made map for ${track.name} (fallback) with ${fallbackMap.patterns.length} patterns`);

    // Generate real map in background and replace when ready
    mapGenerator.generateMap(track)
      .then(realMap => {
        // Only replace if we're still on the same track
        if (currentTrackIndex < tracks.length && tracks[currentTrackIndex].id === track.id) {
          currentMap = realMap;
          currentPatternIndex = 0;
          patternProgress = 0;
          mapBasedSpawning = true;
          console.log(`Upgraded to generated map for ${track.name} with ${realMap.patterns.length} patterns`);
        }
      })
      .catch(error => {
        console.warn(`Failed to generate map for ${track.name}, keeping pre-made fallback:`, error);
      });
  }

  function getCurrentPattern(): MapPattern | null {
    if (!currentMap || !mapBasedSpawning) return null;
    
    const patterns = currentMap.patterns;
    if (patterns.length === 0) return null;
    
    const mapDuration = currentMap.totalDuration;
    if (mapDuration <= 0) return null;
    
    const effectiveTime = trackElapsedMs % mapDuration;
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const patternEnd = pattern.startTime + pattern.duration;
      
      if (effectiveTime >= pattern.startTime && effectiveTime < patternEnd) {
        const globalIndex = Math.floor(trackElapsedMs / mapDuration) * patterns.length + i;
        if (globalIndex !== currentPatternIndex) {
          currentPatternIndex = globalIndex;
          patternProgress = 0;
        } else {
          patternProgress = (effectiveTime - pattern.startTime) / pattern.duration;
        }
        return pattern;
      }
    }
    
    return null;
  }

  function currentParams(): TrackParams {
    if (!transitioning || !nextParams) return params;
    const t = Math.min(1, transitionProgress);
    return {
      scrollSpeed: params.scrollSpeed + (nextParams.scrollSpeed - params.scrollSpeed) * t,
      gravity: params.gravity + (nextParams.gravity - params.gravity) * t,
      jumpForce: params.jumpForce + (nextParams.jumpForce - params.jumpForce) * t,
      spikeChance: params.spikeChance + (nextParams.spikeChance - params.spikeChance) * t,
      blockChance: params.blockChance + (nextParams.blockChance - params.blockChance) * t,
      gapChance: params.gapChance + (nextParams.gapChance - params.gapChance) * t,
      doubleChance: params.doubleChance + (nextParams.doubleChance - params.doubleChance) * t,
      spawnInterval: params.spawnInterval + (nextParams.spawnInterval - params.spawnInterval) * t,
      obstacleColor: lerpColor(params.obstacleColor, nextParams.obstacleColor, t),
      obstacleGlow: lerpColor(params.obstacleGlow, nextParams.obstacleGlow, t),
    };
  }

  // Notify UI of first track
  if (callbacks.onSongChange) {
    callbacks.onSongChange(tracks[0], 0);
  }

  // Initialize first track's map
  loadTrackMapWithFallback(tracks[0]);

  // ── Background visuals ──
  const bpm = config.metrics?.avgTempo || 120;
  const backgroundLayer = new ex.Actor({
    x: W / 2,
    y: H / 2,
    width: W,
    height: H,
    z: -25,
    collisionType: ex.CollisionType.PreventCollision,
  });
  scene.add(backgroundLayer);

  const buildBackgroundGraphic = (key: (typeof GEOMETRY_DASH_BACKGROUND_KEYS)[number]): ex.Canvas => {
    const image = getGDImage(key);
    return new ex.Canvas({
      width: W,
      height: H,
      cache: true,
      draw: (ctx) => {
        if (image) {
          ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, W, H);
        } else {
          const fallbackGradient = ctx.createLinearGradient(0, 0, 0, H);
          fallbackGradient.addColorStop(0, "#050505");
          fallbackGradient.addColorStop(1, config.colorPalette.background);
          ctx.fillStyle = fallbackGradient;
          ctx.fillRect(0, 0, W, H);
        }

        // Add a very light darkening pass for HUD readability without desaturating.
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#000000";
        ctx.globalAlpha = 0.08;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      },
    });
  };

  let currentBackgroundIndex = 0;
  const applyBackgroundGraphic = () => {
    const backgroundKey = GEOMETRY_DASH_BACKGROUND_KEYS[currentBackgroundIndex];
    backgroundLayer.graphics.use(buildBackgroundGraphic(backgroundKey));
  };

  applyBackgroundGraphic();
  const backgroundSwitchTimer = new ex.Timer({
    fcn: () => {
      currentBackgroundIndex = (currentBackgroundIndex + 1) % GEOMETRY_DASH_BACKGROUND_KEYS.length;
      applyBackgroundGraphic();
    },
    interval: BACKGROUND_SWITCH_INTERVAL_MS,
    repeats: true,
  });
  scene.add(backgroundSwitchTimer);
  backgroundSwitchTimer.start();

  addBackgroundParticles(engine, scene, assets.background, bpm);

  // Beat pulse overlay
  const beatMs = 60000 / bpm;
  const pulseOverlay = new ex.Actor({
    x: W / 2, y: H / 2, width: W, height: H,
    color: ex.Color.fromHex(config.colorPalette.accent),
    z: -10,
  });
  pulseOverlay.graphics.opacity = 0;
  scene.add(pulseOverlay);

  const pulseTimer = new ex.Timer({
    fcn: () => {
      const energy = tracks[currentTrackIndex]?.energy || 0.5;
      pulseOverlay.graphics.opacity = 0.03 + energy * 0.05;
      pulseOverlay.actions.fade(0, beatMs * 0.8);
    },
    interval: beatMs,
    repeats: true,
  });
  scene.add(pulseTimer);
  pulseTimer.start();

  // ── Ground (scrolling segments) ──
  const groundSegments: ex.Actor[] = [];
  const SEG_W = W + 200;
  for (let i = 0; i < 3; i++) {
    const gfx = renderPlatform(assets.platform, SEG_W, GROUND_H);
    const seg = new ex.Actor({
      x: i * SEG_W,
      y: GROUND_Y,
      width: SEG_W,
      height: GROUND_H,
      collisionType: ex.CollisionType.Fixed,
      anchor: ex.vec(0, 0.5),
    });
    seg.graphics.use(gfx);
    scene.add(seg);
    groundSegments.push(seg);
  }

  // ── Player cube ──
  const playerColor = config.colorPalette.player || "#00ff88";
  const playerGlow = config.colorPalette.accent || "#00ffaa";
  const hasEyes = assets.player?.eyes ?? true;
  const playerGfx = renderGeoDashPlayer(playerColor, playerGlow, PLAYER_SIZE, hasEyes);

  const player = new ex.Actor({
    x: PLAYER_X,
    y: GROUND_Y - GROUND_H / 2 - PLAYER_SIZE / 2,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    collisionType: ex.CollisionType.Active,
  });
  player.graphics.use(playerGfx);
  scene.add(player);

  let isGrounded = true;
  let isDead = false;

  player.on("postcollision", (evt) => {
    if (isDead) return;
    if (evt.side === ex.Side.Bottom) {
      isGrounded = true;
      player.vel.y = 0;
      player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
      player.angularVelocity = 0;
    }
  });

  // ── Obstacle pool ──
  const obstacles: ex.Actor[] = [];
  let spawnAccumulator = 0;

  function getRightmostObstacleRightEdge(): number {
    let right = -Infinity;
    for (const ob of obstacles) {
      if (ob.isKilled()) continue;
      const obRight = ob.pos.x + ob.width / 2;
      if (obRight > right) right = obRight;
    }
    return right;
  }

  function obstacleBoundsOverlap(
    cx: number,
    cy: number,
    w: number,
    h: number,
    exclude: ex.Actor | null
  ): boolean {
    const left = cx - w / 2;
    const right = cx + w / 2;
    const top = cy - h / 2;
    const bottom = cy + h / 2;
    for (const ob of obstacles) {
      if (ob.isKilled() || ob === exclude) continue;
      const oLeft = ob.pos.x - ob.width / 2;
      const oRight = ob.pos.x + ob.width / 2;
      const oTop = ob.pos.y - ob.height / 2;
      const oBottom = ob.pos.y + ob.height / 2;
      if (left < oRight && right > oLeft && top < oBottom && bottom > oTop) return true;
    }
    return false;
  }

  function spawnObstacle(): boolean {
    const cp = currentParams();
    const pattern = getCurrentPattern();

    if (pattern && mapBasedSpawning) {
      return spawnObstacleFromPattern(pattern, cp);
    }

    const rand = Math.random();
    let totalChance = cp.spikeChance + cp.blockChance;
    let type: "spike" | "block" | "doubleSpike";

    if (rand < cp.spikeChance / totalChance * (1 - cp.doubleChance)) {
      type = "spike";
    } else if (rand < (cp.spikeChance + cp.blockChance * 0.5) / totalChance) {
      type = "block";
    } else if (Math.random() < cp.doubleChance) {
      type = "doubleSpike";
    } else {
      type = "spike";
    }

    const spikeSize = 30 + Math.random() * 10;
    const blockW = 30 + Math.random() * 20;
    const blockH = 30 + Math.random() * 40;

    let obs: ex.Actor;
    let spawnX: number;
    let spawnY: number;
    let obsW: number;
    let obsH: number;

    const rightmostRight = getRightmostObstacleRightEdge();

    switch (type) {
      case "spike": {
        obsW = spikeSize * 0.7;
        obsH = spikeSize * 0.8;
        spawnY = GROUND_Y - GROUND_H / 2 - spikeSize / 2;
        spawnX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + obsW / 2);
        if (obstacleBoundsOverlap(spawnX, spawnY, obsW, obsH, null)) return false;
        const gfx = renderSpike(cp.obstacleColor, cp.obstacleGlow, spikeSize);
        obs = new ex.Actor({
          x: spawnX,
          y: spawnY,
          width: obsW,
          height: obsH,
          collisionType: ex.CollisionType.Passive,
        });
        obs.graphics.use(gfx);
        break;
      }
      case "doubleSpike": {
        const spike2Offset = spikeSize * 0.6;
        const w1 = spikeSize * 0.7;
        const h1 = spikeSize * 0.8;
        const w2 = spikeSize * 0.55;
        const h2 = spikeSize * 0.65;
        const totalRight = spike2Offset + w2 / 2;
        spawnX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + totalRight);
        const x1 = spawnX;
        const y1 = GROUND_Y - GROUND_H / 2 - spikeSize / 2;
        const x2 = spawnX + spike2Offset;
        const y2 = GROUND_Y - GROUND_H / 2 - spikeSize * 0.4;
        if (
          obstacleBoundsOverlap(x1, y1, w1, h1, null) ||
          obstacleBoundsOverlap(x2, y2, w2, h2, null)
        )
          return false;
        const gfx = renderSpike(cp.obstacleColor, cp.obstacleGlow, spikeSize);
        obs = new ex.Actor({
          x: x1,
          y: y1,
          width: w1,
          height: h1,
          collisionType: ex.CollisionType.Passive,
        });
        obs.graphics.use(gfx);
        const gfx2 = renderSpike(cp.obstacleColor, cp.obstacleGlow, spikeSize * 0.8);
        const spike2 = new ex.Actor({
          x: x2,
          y: y2,
          width: w2,
          height: h2,
          collisionType: ex.CollisionType.Passive,
        });
        spike2.graphics.use(gfx2);
        spike2.on("collisionstart", (evt) => {
          if (evt.other.owner === player && !isDead) {
            isDead = true;
            deathEffect();
          }
        });
        scene.add(spike2);
        obstacles.push(spike2);
        break;
      }
      case "block": {
        obsW = blockW;
        obsH = blockH;
        spawnY = GROUND_Y - GROUND_H / 2 - blockH / 2;
        spawnX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + obsW / 2);
        if (obstacleBoundsOverlap(spawnX, spawnY, obsW, obsH, null)) return false;
        const gfx = renderBlock(cp.obstacleColor, cp.obstacleGlow, blockW, blockH);
        obs = new ex.Actor({
          x: spawnX,
          y: spawnY,
          width: obsW,
          height: obsH,
          collisionType: ex.CollisionType.Passive,
        });
        obs.graphics.use(gfx);
        break;
      }
    }

    obs.on("collisionstart", (evt) => {
      if (evt.other.owner === player && !isDead) {
        isDead = true;
        deathEffect();
      }
    });

    scene.add(obs);
    obstacles.push(obs);
    return true;
  }

  function spawnObstacleFromPattern(pattern: MapPattern, cp: TrackParams): boolean {
    const obstacleColor = currentMap?.visualTheme.obstacleColor || cp.obstacleColor;
    const obstacleGlow = currentMap?.visualTheme.obstacleGlow || cp.obstacleGlow;
    const rightmostRight = getRightmostObstacleRightEdge();

    let obs: ex.Actor;

    switch (pattern.type) {
      case "spikes": {
        const spikeCount = pattern.spikeCount || Math.round(3 + pattern.density * 5);
        const spikeSize = 30 + Math.random() * 10;
        const spikeW = spikeSize * 0.7;
        const spikeH = spikeSize * 0.8;
        const spacing = Math.max(pattern.spacing ?? 80, spikeW + MIN_OBSTACLE_GAP);
        const firstX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + spikeW / 2);
        const spikeY = GROUND_Y - GROUND_H / 2 - spikeSize / 2;

        for (let i = 0; i < spikeCount; i++) {
          const sx = firstX + i * spacing;
          if (obstacleBoundsOverlap(sx, spikeY, spikeW, spikeH, null)) return false;
        }
        for (let i = 0; i < spikeCount; i++) {
          const gfx = renderSpike(obstacleColor, obstacleGlow, spikeSize);
          const spike = new ex.Actor({
            x: firstX + i * spacing,
            y: spikeY,
            width: spikeW,
            height: spikeH,
            collisionType: ex.CollisionType.Passive,
          });
          spike.graphics.use(gfx);
          spike.on("collisionstart", (evt) => {
            if (evt.other.owner === player && !isDead) {
              isDead = true;
              deathEffect();
            }
          });
          scene.add(spike);
          obstacles.push(spike);
        }
        return true;
      }
      case "blocks": {
        const blockWidth = pattern.blockWidth || 40;
        const blockHeight = 30 + Math.random() * 20;
        const spawnX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(
                DEFAULT_SPAWN_X,
                rightmostRight + MIN_OBSTACLE_GAP + blockWidth / 2
              );
        const spawnY = GROUND_Y - GROUND_H / 2 - blockHeight / 2;
        if (obstacleBoundsOverlap(spawnX, spawnY, blockWidth, blockHeight, null)) return false;
        const gfx = renderBlock(obstacleColor, obstacleGlow, blockWidth, blockHeight);
        obs = new ex.Actor({
          x: spawnX,
          y: spawnY,
          width: blockWidth,
          height: blockHeight,
          collisionType: ex.CollisionType.Passive,
        });
        obs.graphics.use(gfx);
        break;
      }
      case "gaps":
        return true;
      case "collectibles": {
        const collectCount = pattern.collectibleCount || Math.round(5 + pattern.density * 5);
        const colW = 16;
        const colSpacing = Math.max(pattern.spacing ?? 80, colW + MIN_OBSTACLE_GAP);
        const firstX =
          rightmostRight === -Infinity
            ? W + 80
            : Math.max(W + 80, rightmostRight + MIN_OBSTACLE_GAP + colW / 2);
        const collectYPositions: number[] = [];
        for (let i = 0; i < collectCount; i++) {
          collectYPositions.push(GROUND_Y - GROUND_H / 2 - 60 - Math.random() * 80);
        }
        for (let i = 0; i < collectCount; i++) {
          const cx = firstX + i * colSpacing;
          if (obstacleBoundsOverlap(cx, collectYPositions[i], colW, colW, null)) return false;
        }
        for (let i = 0; i < collectCount; i++) {
          const collectGfx = renderSprite(assets.collectible, 16);
          const col = new ex.Actor({
            x: firstX + i * colSpacing,
            y: collectYPositions[i],
            width: 16,
            height: 16,
            collisionType: ex.CollisionType.Passive,
          });
          col.graphics.use(collectGfx);
          col.angularVelocity = 2;
          col.on("collisionstart", (evt) => {
            if (evt.other.owner === player) {
              addScore(10);
              col.kill();
            }
          });
          scene.add(col);
          obstacles.push(col);
        }
        return true;
      }
      case "mixed": {
        if (Math.random() < 0.6) {
          const spikeSize = 30 + Math.random() * 10;
          const spikeW = spikeSize * 0.7;
          const spikeH = spikeSize * 0.8;
          const spawnX =
            rightmostRight === -Infinity
              ? DEFAULT_SPAWN_X
              : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + spikeW / 2);
          const spawnY = GROUND_Y - GROUND_H / 2 - spikeSize / 2;
          if (obstacleBoundsOverlap(spawnX, spawnY, spikeW, spikeH, null)) return false;
          const gfx = renderSpike(obstacleColor, obstacleGlow, spikeSize);
          obs = new ex.Actor({
            x: spawnX,
            y: spawnY,
            width: spikeW,
            height: spikeH,
            collisionType: ex.CollisionType.Passive,
          });
          obs.graphics.use(gfx);
        } else {
          const blockWidth = 30 + Math.random() * 20;
          const blockHeight = 30 + Math.random() * 40;
          const spawnX =
            rightmostRight === -Infinity
              ? DEFAULT_SPAWN_X
              : Math.max(
                  DEFAULT_SPAWN_X,
                  rightmostRight + MIN_OBSTACLE_GAP + blockWidth / 2
                );
          const spawnY = GROUND_Y - GROUND_H / 2 - blockHeight / 2;
          if (obstacleBoundsOverlap(spawnX, spawnY, blockWidth, blockHeight, null)) return false;
          const gfx = renderBlock(obstacleColor, obstacleGlow, blockWidth, blockHeight);
          obs = new ex.Actor({
            x: spawnX,
            y: spawnY,
            width: blockWidth,
            height: blockHeight,
            collisionType: ex.CollisionType.Passive,
          });
          obs.graphics.use(gfx);
        }
        break;
      }
      default: {
        const spikeSize = 30 + Math.random() * 10;
        const spikeW = spikeSize * 0.7;
        const spikeH = spikeSize * 0.8;
        const spawnX =
          rightmostRight === -Infinity
            ? DEFAULT_SPAWN_X
            : Math.max(DEFAULT_SPAWN_X, rightmostRight + MIN_OBSTACLE_GAP + spikeW / 2);
        const spawnY = GROUND_Y - GROUND_H / 2 - spikeSize / 2;
        if (obstacleBoundsOverlap(spawnX, spawnY, spikeW, spikeH, null)) return false;
        const gfx = renderSpike(obstacleColor, obstacleGlow, spikeSize);
        obs = new ex.Actor({
          x: spawnX,
          y: spawnY,
          width: spikeW,
          height: spikeH,
          collisionType: ex.CollisionType.Passive,
        });
        obs.graphics.use(gfx);
      }
    }

    obs.on("collisionstart", (evt) => {
      if (evt.other.owner === player && !isDead) {
        isDead = true;
        deathEffect();
      }
    });

    scene.add(obs);
    obstacles.push(obs);
    return true;
  }

  function deathEffect() {
    // Flash + slight delay before game over
    player.graphics.opacity = 0.3;
    player.vel = ex.vec(0, 0);
    player.acc = ex.vec(0, 0);

    const flashTimer = new ex.Timer({
      fcn: () => {
        gameOver();
      },
      interval: 600,
      repeats: false,
    });
    scene.add(flashTimer);
    flashTimer.start();
  }

  // ── Collectible stars ──
  let collectibleAccum = 0;
  function spawnCollectible() {
    const cp = currentParams();
    const collectGfx = renderSprite(assets.collectible, 16);
    const col = new ex.Actor({
      x: W + 80,
      y: GROUND_Y - GROUND_H / 2 - 60 - Math.random() * 80,
      width: 16,
      height: 16,
      collisionType: ex.CollisionType.Passive,
    });
    col.graphics.use(collectGfx);
    col.angularVelocity = 2;
    col.on("collisionstart", (evt) => {
      if (evt.other.owner === player) {
        addScore(10);
        col.kill();
      }
    });
    scene.add(col);
    obstacles.push(col);
  }

  // ── Progress line (ground line effect) ──
  const progressLine = new ex.Actor({
    x: 0,
    y: GROUND_Y - GROUND_H / 2 - 1,
    anchor: ex.vec(0, 0.5),
    width: W,
    height: 2,
    color: ex.Color.fromHex(config.colorPalette.accent),
    z: 5,
  });
  progressLine.graphics.opacity = 0.4;
  scene.add(progressLine);

  // ── Track jumped obstacles for scoring ──
  const jumpedObstacles = new Set<ex.Actor>();
  let lastPlayerX = PLAYER_X;

  // ── Input ──
  // Track pointer (mouse/touch) for click-to-jump
  let pointerDown = false;
  scene.on("preupdate", () => {
    pointerDown = engine.input.pointers.isDown(0);
  });

  // ── Main update loop ──
  scene.on("preupdate", (evt) => {
    if (isDead) return;

    const dt = evt.elapsed;
    const cp = currentParams();

    // ── Track timer ──
    trackElapsedMs += dt;
    const currentTrack = tracks[currentTrackIndex];
    
    // Start preloading next map when we're 75% through current song
    if (!preloadStarted && trackElapsedMs >= currentTrack.durationMs * 0.75) {
      preloadStarted = true;
      // Preload next map in background (will use fallback if Gemini is slow)
      const nextIndex = (currentTrackIndex + 1) % tracks.length;
      const nextTrack = tracks[nextIndex];
      if (nextTrack && !mapGenerator.getCachedMap(nextTrack.id)) {
        mapGenerator.generateMap(nextTrack)
          .then(map => {
            console.log(`Preloaded map for next track: ${nextTrack.name}`);
          })
          .catch(error => {
            console.warn(`Failed to preload map for ${nextTrack.name}:`, error);
          });
      }
    }
    
    if (trackElapsedMs >= currentTrack.durationMs) {
      switchToTrack(currentTrackIndex + 1);
      preloadStarted = false; // Reset for next song
    }

    // Transition interpolation
    if (transitioning && nextParams) {
      transitionProgress += dt / TRANSITION_MS;
      if (transitionProgress >= 1) {
        params = nextParams;
        nextParams = null;
        transitioning = false;
        transitionProgress = 0;
      }
    }

    // ── Gravity & Jump ──
    player.acc.y = cp.gravity;

    const jumpPressed =
      engine.input.keyboard.wasPressed(ex.Keys.Space) ||
      engine.input.keyboard.wasPressed(ex.Keys.Up) ||
      engine.input.keyboard.wasPressed(ex.Keys.W) ||
      pointerDown;

    const skipPressed = engine.input.keyboard.wasPressed(ex.Keys.Tab) || 
                        engine.input.keyboard.wasPressed(ex.Keys.Right);

    if (skipPressed && !isDead) {
      // Manual song skip
      console.log(`Skipping to next song`);
      switchToTrack(currentTrackIndex + 1);
      preloadStarted = false; // Reset for next song
    }

    if (jumpPressed && isGrounded) {
      player.vel.y = cp.jumpForce;
      isGrounded = false;
      // Spin rotation while airborne (GD style)
      player.angularVelocity = cp.scrollSpeed * 0.012;
    }

    // Keep player at fixed X
    player.pos.x = PLAYER_X;
    player.vel.x = 0;

    // Fell off screen
    if (player.pos.y > H + 100) {
      isDead = true;
      gameOver();
      return;
    }

    // ── Scroll ground ──
    for (const seg of groundSegments) {
      seg.pos.x -= cp.scrollSpeed * (dt / 1000);
      if (seg.pos.x + SEG_W < -10) {
        // Find rightmost segment and place after it
        let maxX = -Infinity;
        for (const s of groundSegments) {
          if (s.pos.x + SEG_W > maxX) maxX = s.pos.x + SEG_W;
        }
        seg.pos.x = maxX;
      }
    }

    // ── Scroll obstacles ──
    const scrollPx = cp.scrollSpeed * (dt / 1000);
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      if (ob.isKilled()) {
        obstacles.splice(i, 1);
        continue;
      }
      ob.pos.x -= scrollPx;
      if (ob.pos.x < -100) {
        ob.kill();
        obstacles.splice(i, 1);
      }
    }

    // ── Spawn obstacles ──
    spawnAccumulator += dt;

    const activePattern = getCurrentPattern();
    const patternDensityFactor = activePattern ? (1 - activePattern.density * 0.5) : 1;
    const effectiveSpawnInterval = mapBasedSpawning && activePattern
      ? Math.max(300, cp.spawnInterval * patternDensityFactor)
      : cp.spawnInterval;

    if (spawnAccumulator >= effectiveSpawnInterval) {
      const jumpDuration = 2 * Math.abs(cp.jumpForce) / cp.gravity;
      const jumpDistance = cp.scrollSpeed * jumpDuration;
      const minGap = Math.max(MIN_OBSTACLE_GAP, jumpDistance + PLAYER_SIZE * 3);
      const rightmostRight = getRightmostObstacleRightEdge();
      const maxNewHalfWidth = 35;
      const canSpawn =
        rightmostRight === -Infinity ||
        DEFAULT_SPAWN_X - (rightmostRight + maxNewHalfWidth) >= minGap;

      if (canSpawn && spawnObstacle()) {
        spawnAccumulator -= effectiveSpawnInterval;
      }
    }

    // ── Spawn collectibles (only if not using map-based spawning) ──
    if (!mapBasedSpawning) {
      collectibleAccum += dt;
      if (collectibleAccum >= cp.spawnInterval * 2.5) {
        collectibleAccum -= cp.spawnInterval * 2.5;
        if (Math.random() < 0.6) {
          spawnCollectible();
        }
      }
    }

    // ── Track successfully jumped obstacles ──
    for (const ob of obstacles) {
      if (ob.isKilled() || jumpedObstacles.has(ob)) continue;
      
      // Check if player has passed the obstacle
      if (ob.pos.x < PLAYER_X && ob.pos.x + ob.width > lastPlayerX) {
        // Player just passed this obstacle - award points for successful jump
        if (ob.pos.y < GROUND_Y - GROUND_H / 2 - 10) { // It's an obstacle, not ground
          addScore(1);
          jumpedObstacles.add(ob);
        }
      }
    }
    
    lastPlayerX = PLAYER_X;
  });
}
