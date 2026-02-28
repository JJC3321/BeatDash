import * as ex from "excalibur";
import { GameConfiguration, AssetDescriptions } from "@/types/game";
import { renderSprite, renderPlatform, addBackgroundParticles, getDefaultAssets } from "@/game/assets";

interface GameCallbacks {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

// ─── Music helpers ───────────────────────────────────────────────

function getBpm(config: GameConfiguration): number {
  return config.metrics?.avgTempo || 120;
}

function getBeatMs(config: GameConfiguration): number {
  return 60000 / getBpm(config);
}

function getMusicSpawnRate(config: GameConfiguration): number {
  if (!config.metrics) return config.spawnRateMs;
  const beatMs = getBeatMs(config);
  const energy = config.metrics.avgEnergy;
  const energyMultiplier = 1.5 - energy;
  return Math.max(400, Math.min(3000, beatMs * energyMultiplier));
}

function getMusicSpeedMultiplier(config: GameConfiguration): number {
  if (!config.metrics) return 1;
  const tempoFactor = config.metrics.avgTempo / 120;
  return tempoFactor * (0.7 + config.metrics.avgEnergy * 0.6);
}

function getMusicGravity(config: GameConfiguration): number {
  if (!config.metrics) return config.gravity;
  return config.gravity * (1.2 - config.metrics.avgAcousticness * 0.7);
}

// ─── Scene setup helpers ─────────────────────────────────────────

function getAssets(config: GameConfiguration): AssetDescriptions {
  return config.assets || getDefaultAssets(config.colorPalette);
}

/** BPM-synced background pulse overlay */
function addBeatPulse(engine: ex.Engine, scene: ex.Scene, config: GameConfiguration) {
  const beatInterval = getBeatMs(config);
  const energy = config.metrics?.avgEnergy || 0.5;

  const pulseOverlay = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight / 2,
    width: engine.drawWidth,
    height: engine.drawHeight,
    color: ex.Color.fromHex(config.colorPalette.accent).clone(),
    z: -10,
  });
  pulseOverlay.graphics.opacity = 0;
  scene.add(pulseOverlay);

  let beatCount = 0;
  const pulseTimer = new ex.Timer({
    fcn: () => {
      beatCount++;
      const intensity = 0.04 + energy * 0.06;
      pulseOverlay.graphics.opacity = intensity;
      pulseOverlay.actions.fade(0, beatInterval * 0.8);

      // Screen shake on every 4th beat scaled by energy
      if (beatCount % 4 === 0 && energy > 0.5) {
        const shakeAmt = (energy - 0.5) * 6;
        scene.camera.shake(shakeAmt, shakeAmt, beatInterval * 0.3);
      }
    },
    interval: beatInterval,
    repeats: true,
  });
  scene.add(pulseTimer);
  pulseTimer.start();
}

/** Set up the full visual scene: particles + beat pulse */
function setupSceneVisuals(engine: ex.Engine, scene: ex.Scene, config: GameConfiguration) {
  const assets = getAssets(config);
  addBeatPulse(engine, scene, config);
  addBackgroundParticles(engine, scene, assets.background, getBpm(config));
}

/** Apply the rotation animation driven by BPM */
function addBeatRotation(actor: ex.Actor, config: GameConfiguration) {
  const bpm = getBpm(config);
  const rotSpeed = (bpm / 120) * 1.5; // radians per second
  actor.angularVelocity = rotSpeed;
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

  switch (config.gameType) {
    case "platformer":
      setupPlatformer(engine, config, addScore, gameOver);
      break;
    case "dodge":
      setupDodge(engine, config, addScore, gameOver);
      break;
    case "collector":
      setupCollector(engine, config, addScore, gameOver);
      break;
    case "runner":
      setupRunner(engine, config, addScore, gameOver);
      break;
    default:
      setupPlatformer(engine, config, addScore, gameOver);
  }

  return engine;
}

// ─── Platformer ──────────────────────────────────────────────────

function setupPlatformer(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const assets = getAssets(config);
  const gravity = 800 * getMusicGravity(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  setupSceneVisuals(engine, scene, config);

  // Player
  const playerGraphic = renderSprite(assets.player, 32);
  const player = new ex.Actor({
    x: 100,
    y: engine.drawHeight - 100,
    width: 32,
    height: 32,
    collisionType: ex.CollisionType.Active,
  });
  player.graphics.use(playerGraphic);
  player.body.useGravity = true;
  player.vel = ex.vec(0, 0);
  let isGrounded = false;

  player.on("postcollision", (evt) => {
    if (evt.side === ex.Side.Bottom) {
      isGrounded = true;
      player.vel.y = 0;
    }
  });
  scene.add(player);

  // Ground
  const groundW = engine.drawWidth * 3;
  const groundH = 32;
  const groundGraphic = renderPlatform(assets.platform, groundW, groundH);
  const ground = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight - 16,
    width: groundW,
    height: groundH,
    collisionType: ex.CollisionType.Fixed,
  });
  ground.graphics.use(groundGraphic);
  scene.add(ground);

  // Platforms + collectibles
  const collectibleGraphic = renderSprite(assets.collectible, 16);
  const platformCount = 8;
  for (let i = 0; i < platformCount; i++) {
    const pw = 80 + Math.random() * 60;
    const ph = 16;
    const platGraphic = renderPlatform(assets.platform, pw, ph);
    const plat = new ex.Actor({
      x: 200 + i * 200 + Math.random() * 100,
      y: engine.drawHeight - 100 - Math.random() * 300,
      width: pw,
      height: ph,
      collisionType: ex.CollisionType.Fixed,
    });
    plat.graphics.use(platGraphic);
    scene.add(plat);

    if (Math.random() > 0.4) {
      const col = new ex.Actor({
        x: plat.pos.x,
        y: plat.pos.y - 30,
        width: 16,
        height: 16,
        collisionType: ex.CollisionType.Passive,
      });
      col.graphics.use(collectibleGraphic);
      addBeatRotation(col, config);
      col.on("collisionstart", (evt) => {
        if (evt.other.owner === player) {
          addScore(10);
          col.kill();
        }
      });
      scene.add(col);
    }
  }

  // Enemy spawner
  const enemyDescs = assets.enemies;
  const spawnEnemy = () => {
    const desc = enemyDescs[Math.floor(Math.random() * enemyDescs.length)];
    const enemyGraphic = renderSprite(desc, 24);
    const enemy = new ex.Actor({
      x: engine.drawWidth + 50,
      y: engine.drawHeight - 50,
      width: 24,
      height: 24,
      collisionType: ex.CollisionType.Active,
    });
    enemy.graphics.use(enemyGraphic);
    addBeatRotation(enemy, config);
    enemy.vel = ex.vec(-config.playerSpeed * 0.8 * speedMult, 0);
    enemy.on("collisionstart", (evt) => {
      if (evt.other.owner === player) gameOver();
    });
    enemy.on("exitviewport", () => {
      enemy.kill();
      addScore(5);
    });
    scene.add(enemy);
  };

  const enemyTimer = new ex.Timer({ fcn: spawnEnemy, interval: spawnRate, repeats: true });
  scene.add(enemyTimer);
  enemyTimer.start();

  // Input
  scene.on("preupdate", () => {
    player.acc.y = gravity;

    if (engine.input.keyboard.isHeld(ex.Keys.Left) || engine.input.keyboard.isHeld(ex.Keys.A)) {
      player.vel.x = -config.playerSpeed;
    } else if (engine.input.keyboard.isHeld(ex.Keys.Right) || engine.input.keyboard.isHeld(ex.Keys.D)) {
      player.vel.x = config.playerSpeed;
    } else {
      player.vel.x = 0;
    }

    if (
      (engine.input.keyboard.wasPressed(ex.Keys.Space) || engine.input.keyboard.wasPressed(ex.Keys.Up) || engine.input.keyboard.wasPressed(ex.Keys.W)) &&
      isGrounded
    ) {
      player.vel.y = -500;
      isGrounded = false;
    }

    engine.currentScene.camera.x = player.pos.x;

    if (player.pos.y > engine.drawHeight + 100) {
      gameOver();
    }
  });
}

// ─── Dodge ───────────────────────────────────────────────────────

function setupDodge(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const assets = getAssets(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  setupSceneVisuals(engine, scene, config);

  // Player
  const playerGraphic = renderSprite(assets.player, 28);
  const player = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight - 60,
    width: 28,
    height: 28,
    collisionType: ex.CollisionType.Active,
  });
  player.graphics.use(playerGraphic);
  scene.add(player);

  // Obstacle spawner
  const enemyDescs = assets.enemies;
  const spawnObstacle = () => {
    const size = 20 + Math.random() * 30;
    const desc = enemyDescs[Math.floor(Math.random() * enemyDescs.length)];
    const obsGraphic = renderSprite(desc, size);
    const obs = new ex.Actor({
      x: Math.random() * engine.drawWidth,
      y: -20,
      width: size,
      height: size,
      collisionType: ex.CollisionType.Passive,
    });
    obs.graphics.use(obsGraphic);
    addBeatRotation(obs, config);
    obs.vel = ex.vec(
      (Math.random() - 0.5) * 50 * speedMult,
      (config.playerSpeed * 0.6 + Math.random() * 100) * speedMult
    );
    obs.on("collisionstart", (evt) => {
      if (evt.other.owner === player) gameOver();
    });
    obs.on("exitviewport", () => {
      obs.kill();
      addScore(1);
    });
    scene.add(obs);
  };

  const timer = new ex.Timer({ fcn: spawnObstacle, interval: spawnRate, repeats: true });
  scene.add(timer);
  timer.start();

  const scoreTimer = new ex.Timer({ fcn: () => addScore(1), interval: 500, repeats: true });
  scene.add(scoreTimer);
  scoreTimer.start();

  scene.on("preupdate", () => {
    const speed = config.playerSpeed;
    if (engine.input.keyboard.isHeld(ex.Keys.Left) || engine.input.keyboard.isHeld(ex.Keys.A)) {
      player.vel.x = -speed;
    } else if (engine.input.keyboard.isHeld(ex.Keys.Right) || engine.input.keyboard.isHeld(ex.Keys.D)) {
      player.vel.x = speed;
    } else {
      player.vel.x = 0;
    }
    if (engine.input.keyboard.isHeld(ex.Keys.Up) || engine.input.keyboard.isHeld(ex.Keys.W)) {
      player.vel.y = -speed;
    } else if (engine.input.keyboard.isHeld(ex.Keys.Down) || engine.input.keyboard.isHeld(ex.Keys.S)) {
      player.vel.y = speed;
    } else {
      player.vel.y = 0;
    }

    player.pos.x = ex.clamp(player.pos.x, 16, engine.drawWidth - 16);
    player.pos.y = ex.clamp(player.pos.y, 16, engine.drawHeight - 16);
  });
}

// ─── Collector ───────────────────────────────────────────────────

function setupCollector(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const assets = getAssets(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  setupSceneVisuals(engine, scene, config);

  // Player
  const playerGraphic = renderSprite(assets.player, 24);
  const player = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight / 2,
    width: 24,
    height: 24,
    collisionType: ex.CollisionType.Active,
  });
  player.graphics.use(playerGraphic);
  scene.add(player);

  let missed = 0;
  const maxMissed = 10;

  // Collectible spawner
  const collectibleGraphic = renderSprite(assets.collectible, 12);
  const spawnParticle = () => {
    const p = new ex.Actor({
      x: Math.random() * engine.drawWidth,
      y: -10,
      width: 12,
      height: 12,
      collisionType: ex.CollisionType.Passive,
    });
    p.graphics.use(collectibleGraphic);
    addBeatRotation(p, config);
    p.vel = ex.vec(
      (Math.random() - 0.5) * 30,
      (40 + Math.random() * 60) * speedMult
    );
    p.on("collisionstart", (evt) => {
      if (evt.other.owner === player) {
        addScore(5);
        p.kill();
      }
    });
    p.on("exitviewport", () => {
      p.kill();
      missed++;
      if (missed >= maxMissed) gameOver();
    });
    scene.add(p);
  };

  const timer = new ex.Timer({ fcn: spawnParticle, interval: spawnRate, repeats: true });
  scene.add(timer);
  timer.start();

  scene.on("preupdate", () => {
    const speed = config.playerSpeed * 0.8;
    player.vel.x = 0;
    player.vel.y = 0;
    if (engine.input.keyboard.isHeld(ex.Keys.Left) || engine.input.keyboard.isHeld(ex.Keys.A)) player.vel.x = -speed;
    if (engine.input.keyboard.isHeld(ex.Keys.Right) || engine.input.keyboard.isHeld(ex.Keys.D)) player.vel.x = speed;
    if (engine.input.keyboard.isHeld(ex.Keys.Up) || engine.input.keyboard.isHeld(ex.Keys.W)) player.vel.y = -speed;
    if (engine.input.keyboard.isHeld(ex.Keys.Down) || engine.input.keyboard.isHeld(ex.Keys.S)) player.vel.y = speed;
    player.pos.x = ex.clamp(player.pos.x, 16, engine.drawWidth - 16);
    player.pos.y = ex.clamp(player.pos.y, 16, engine.drawHeight - 16);
  });
}

// ─── Runner ──────────────────────────────────────────────────────

function setupRunner(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const assets = getAssets(config);
  const musicGravity = getMusicGravity(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  setupSceneVisuals(engine, scene, config);

  const groundY = engine.drawHeight - 60;

  // Ground
  const groundW = engine.drawWidth * 2;
  const groundH = 32;
  const groundGraphic = renderPlatform(assets.platform, groundW, groundH);
  const ground = new ex.Actor({
    x: engine.drawWidth / 2,
    y: groundY + 16,
    width: groundW,
    height: groundH,
    collisionType: ex.CollisionType.Fixed,
  });
  ground.graphics.use(groundGraphic);
  scene.add(ground);

  // Player
  const playerGraphic = renderSprite(assets.player, 28);
  const player = new ex.Actor({
    x: 120,
    y: groundY - 20,
    width: 28,
    height: 28,
    collisionType: ex.CollisionType.Active,
  });
  player.graphics.use(playerGraphic);
  player.body.useGravity = true;
  let isGrounded = true;

  player.on("postcollision", (evt) => {
    if (evt.side === ex.Side.Bottom) {
      isGrounded = true;
      player.vel.y = 0;
    }
  });
  scene.add(player);

  // Obstacle spawner
  const enemyDescs = assets.enemies;
  const spawnObs = () => {
    const h = 20 + Math.random() * 40;
    const desc = enemyDescs[Math.floor(Math.random() * enemyDescs.length)];
    const obsGraphic = renderSprite(desc, Math.max(20, h));
    const obs = new ex.Actor({
      x: engine.drawWidth + 50,
      y: groundY - h / 2,
      width: 20,
      height: h,
      collisionType: ex.CollisionType.Passive,
    });
    obs.graphics.use(obsGraphic);
    addBeatRotation(obs, config);
    obs.vel = ex.vec(-config.playerSpeed * speedMult, 0);
    obs.on("collisionstart", (evt) => {
      if (evt.other.owner === player) gameOver();
    });
    obs.on("exitviewport", () => {
      obs.kill();
      addScore(10);
    });
    scene.add(obs);
  };

  const timer = new ex.Timer({ fcn: spawnObs, interval: spawnRate, repeats: true });
  scene.add(timer);
  timer.start();

  const scoreTimer = new ex.Timer({ fcn: () => addScore(1), interval: 300, repeats: true });
  scene.add(scoreTimer);
  scoreTimer.start();

  scene.on("preupdate", () => {
    player.acc.y = 800 * musicGravity;

    if (
      (engine.input.keyboard.wasPressed(ex.Keys.Space) || engine.input.keyboard.wasPressed(ex.Keys.Up) || engine.input.keyboard.wasPressed(ex.Keys.W)) &&
      isGrounded
    ) {
      player.vel.y = -450;
      isGrounded = false;
    }

    if (player.pos.y > engine.drawHeight + 100) gameOver();
  });
}
