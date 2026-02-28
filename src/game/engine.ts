import * as ex from "excalibur";
import { GameConfiguration } from "@/types/game";

interface GameCallbacks {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

/** Create a BPM-synced background pulse overlay */
function addBeatPulse(engine: ex.Engine, scene: ex.Scene, config: GameConfiguration) {
  const bpm = config.metrics?.avgTempo || 120;
  const beatInterval = 60000 / bpm; // ms per beat

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

  const pulseTimer = new ex.Timer({
    fcn: () => {
      pulseOverlay.graphics.opacity = 0.08;
      pulseOverlay.actions.fade(0, beatInterval * 0.8);
    },
    interval: beatInterval,
    repeats: true,
  });
  scene.add(pulseTimer);
  pulseTimer.start();
}

/** Get music-driven spawn rate: one obstacle per beat, scaled by energy */
function getMusicSpawnRate(config: GameConfiguration): number {
  if (!config.metrics) return config.spawnRateMs;
  const bpm = config.metrics.avgTempo;
  const energy = config.metrics.avgEnergy;
  // Base: one spawn per beat, made faster by energy
  const beatMs = 60000 / bpm;
  const energyMultiplier = 1.5 - energy; // high energy = faster spawns
  return Math.max(400, Math.min(3000, beatMs * energyMultiplier));
}

/** Get music-driven obstacle speed multiplier */
function getMusicSpeedMultiplier(config: GameConfiguration): number {
  if (!config.metrics) return 1;
  const tempo = config.metrics.avgTempo;
  const energy = config.metrics.avgEnergy;
  // Normalize tempo: 80 BPM → 0.7x, 120 → 1.0x, 160 → 1.3x
  const tempoFactor = tempo / 120;
  return tempoFactor * (0.7 + energy * 0.6);
}

/** Get gravity based on acousticness (acoustic = floaty) */
function getMusicGravity(config: GameConfiguration): number {
  if (!config.metrics) return config.gravity;
  const acousticness = config.metrics.avgAcousticness;
  // Acoustic music → lower gravity (floatier), electronic → heavier
  return config.gravity * (1.2 - acousticness * 0.7);
}

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

function setupPlatformer(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const gravity = 800 * getMusicGravity(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  addBeatPulse(engine, scene, config);

  const player = new ex.Actor({
    x: 100,
    y: engine.drawHeight - 100,
    width: 32,
    height: 32,
    color: ex.Color.fromHex(config.colorPalette.player),
    collisionType: ex.CollisionType.Active,
  });
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

  const ground = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight - 16,
    width: engine.drawWidth * 3,
    height: 32,
    color: ex.Color.fromHex(config.colorPalette.platforms),
    collisionType: ex.CollisionType.Fixed,
  });
  scene.add(ground);

  const platformCount = 8;
  for (let i = 0; i < platformCount; i++) {
    const plat = new ex.Actor({
      x: 200 + i * 200 + Math.random() * 100,
      y: engine.drawHeight - 100 - Math.random() * 300,
      width: 80 + Math.random() * 60,
      height: 16,
      color: ex.Color.fromHex(config.colorPalette.platforms),
      collisionType: ex.CollisionType.Fixed,
    });
    scene.add(plat);

    if (Math.random() > 0.4) {
      const col = new ex.Actor({
        x: plat.pos.x,
        y: plat.pos.y - 30,
        width: 16,
        height: 16,
        color: ex.Color.fromHex(config.colorPalette.collectibles),
        collisionType: ex.CollisionType.Passive,
      });
      col.on("collisionstart", (evt) => {
        if (evt.other.owner === player) {
          addScore(10);
          col.kill();
        }
      });
      scene.add(col);
    }
  }

  const spawnEnemy = () => {
    const enemy = new ex.Actor({
      x: engine.drawWidth + 50,
      y: engine.drawHeight - 50,
      width: 24,
      height: 24,
      color: ex.Color.fromHex(config.colorPalette.enemies),
      collisionType: ex.CollisionType.Active,
    });
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

  const enemyTimer = new ex.Timer({
    fcn: spawnEnemy,
    interval: spawnRate,
    repeats: true,
  });
  scene.add(enemyTimer);
  enemyTimer.start();

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

function setupDodge(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  addBeatPulse(engine, scene, config);

  const player = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight - 60,
    width: 28,
    height: 28,
    color: ex.Color.fromHex(config.colorPalette.player),
    collisionType: ex.CollisionType.Active,
  });
  scene.add(player);

  const spawnObstacle = () => {
    const obs = new ex.Actor({
      x: Math.random() * engine.drawWidth,
      y: -20,
      width: 20 + Math.random() * 30,
      height: 20 + Math.random() * 30,
      color: ex.Color.fromHex(config.colorPalette.enemies),
      collisionType: ex.CollisionType.Passive,
    });
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

function setupCollector(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  addBeatPulse(engine, scene, config);

  const player = new ex.Actor({
    x: engine.drawWidth / 2,
    y: engine.drawHeight / 2,
    width: 24,
    height: 24,
    color: ex.Color.fromHex(config.colorPalette.player),
    collisionType: ex.CollisionType.Active,
  });
  scene.add(player);

  let missed = 0;
  const maxMissed = 10;

  const spawnParticle = () => {
    const p = new ex.Actor({
      x: Math.random() * engine.drawWidth,
      y: -10,
      width: 12,
      height: 12,
      color: ex.Color.fromHex(config.colorPalette.collectibles),
      collisionType: ex.CollisionType.Passive,
    });
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

function setupRunner(
  engine: ex.Engine,
  config: GameConfiguration,
  addScore: (n: number) => void,
  gameOver: () => void
) {
  const scene = new ex.Scene();
  engine.addScene("main", scene);
  engine.goToScene("main");

  const musicGravity = getMusicGravity(config);
  const speedMult = getMusicSpeedMultiplier(config);
  const spawnRate = getMusicSpawnRate(config);

  addBeatPulse(engine, scene, config);

  const groundY = engine.drawHeight - 60;

  const ground = new ex.Actor({
    x: engine.drawWidth / 2,
    y: groundY + 16,
    width: engine.drawWidth * 2,
    height: 32,
    color: ex.Color.fromHex(config.colorPalette.platforms),
    collisionType: ex.CollisionType.Fixed,
  });
  scene.add(ground);

  const player = new ex.Actor({
    x: 120,
    y: groundY - 20,
    width: 28,
    height: 28,
    color: ex.Color.fromHex(config.colorPalette.player),
    collisionType: ex.CollisionType.Active,
  });
  player.body.useGravity = true;
  let isGrounded = true;

  player.on("postcollision", (evt) => {
    if (evt.side === ex.Side.Bottom) {
      isGrounded = true;
      player.vel.y = 0;
    }
  });

  scene.add(player);

  const spawnObs = () => {
    const h = 20 + Math.random() * 40;
    const obs = new ex.Actor({
      x: engine.drawWidth + 50,
      y: groundY - h / 2,
      width: 20,
      height: h,
      color: ex.Color.fromHex(config.colorPalette.enemies),
      collisionType: ex.CollisionType.Passive,
    });
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
