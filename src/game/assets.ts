import * as ex from "excalibur";
import { AssetShape, SpriteDescription, PlatformDescription, BackgroundDescription, AssetDescriptions } from "@/types/game";

/** Draw a shape path on a 2D canvas context */
function drawShape(ctx: CanvasRenderingContext2D, shape: AssetShape, cx: number, cy: number, r: number) {
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
      ctx.closePath();
      break;
    case "star": {
      for (let i = 0; i < 5; i++) {
        const outerAngle = ((i * 72 - 90) * Math.PI) / 180;
        const innerAngle = ((i * 72 + 36 - 90) * Math.PI) / 180;
        const ox = cx + r * Math.cos(outerAngle);
        const oy = cy + r * Math.sin(outerAngle);
        const ix = cx + r * 0.4 * Math.cos(innerAngle);
        const iy = cy + r * 0.4 * Math.sin(innerAngle);
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      break;
    }
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const angle = ((i * 60 - 30) * Math.PI) / 180;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case "crescent": {
      ctx.arc(cx - r * 0.15, cy, r, -0.8, 0.8);
      ctx.arc(cx + r * 0.35, cy, r * 0.7, 0.9, -0.9, true);
      ctx.closePath();
      break;
    }
    case "bolt": {
      const s = r * 0.35;
      ctx.moveTo(cx + s * 0.2, cy - r);
      ctx.lineTo(cx + s * 2, cy - r * 0.3);
      ctx.lineTo(cx + s * 0.5, cy - r * 0.05);
      ctx.lineTo(cx + s * 1.5, cy + r);
      ctx.lineTo(cx - s * 0.8, cy + r * 0.15);
      ctx.lineTo(cx - s * 0.1, cy + r * 0.05);
      ctx.lineTo(cx - s * 1.2, cy - r * 0.3);
      ctx.closePath();
      break;
    }
  }
}

/** Render a sprite from its AI-generated description */
export function renderSprite(desc: SpriteDescription, size: number): ex.Canvas {
  const pad = desc.style === "neon" ? 10 : 6;
  const total = size + pad * 2;

  return new ex.Canvas({
    width: total,
    height: total,
    cache: true,
    draw: (ctx) => {
      const cx = total / 2;
      const cy = total / 2;
      const r = size / 2 - 2;

      ctx.save();

      // Glow effect
      if (desc.style === "neon" || desc.glowColor) {
        ctx.shadowColor = desc.glowColor || desc.primaryColor;
        ctx.shadowBlur = desc.style === "neon" ? 14 : 8;
      }

      // Determine fill
      if (desc.style === "gradient") {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, desc.primaryColor);
        grad.addColorStop(1, desc.secondaryColor);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = desc.primaryColor;
      }

      drawShape(ctx, desc.shape, cx, cy, r);

      if (desc.style === "outlined") {
        ctx.strokeStyle = desc.primaryColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = desc.secondaryColor + "30";
        ctx.fill();
      } else if (desc.style === "neon") {
        ctx.strokeStyle = desc.primaryColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = desc.primaryColor + "18";
        ctx.fill();
      } else {
        ctx.fill();
      }

      // Eyes
      if (desc.eyes) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        const eyeR = r * 0.14;
        const eyeY = cy - r * 0.1;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.25, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, eyeY, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.25, eyeY, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
  });
}

/** Render a platform graphic from its description */
export function renderPlatform(desc: PlatformDescription, width: number, height: number): ex.Canvas {
  return new ex.Canvas({
    width,
    height,
    cache: true,
    draw: (ctx) => {
      ctx.save();
      const rad = Math.min(4, height / 2);

      if (desc.style === "glowing") {
        ctx.shadowColor = desc.accentColor;
        ctx.shadowBlur = 10;
      }

      // Fill
      if (desc.style === "gradient") {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, desc.primaryColor);
        grad.addColorStop(1, desc.accentColor);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = desc.primaryColor;
      }

      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(rad, 0);
      ctx.lineTo(width - rad, 0);
      ctx.quadraticCurveTo(width, 0, width, rad);
      ctx.lineTo(width, height - rad);
      ctx.quadraticCurveTo(width, height, width - rad, height);
      ctx.lineTo(rad, height);
      ctx.quadraticCurveTo(0, height, 0, height - rad);
      ctx.lineTo(0, rad);
      ctx.quadraticCurveTo(0, 0, rad, 0);
      ctx.closePath();
      ctx.fill();

      // Stripes overlay
      if (desc.style === "striped") {
        ctx.fillStyle = desc.accentColor + "50";
        for (let x = 0; x < width; x += 8) {
          ctx.fillRect(x, 0, 4, height);
        }
      }

      // Top accent line
      ctx.shadowBlur = 0;
      ctx.strokeStyle = desc.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rad, 1);
      ctx.lineTo(width - rad, 1);
      ctx.stroke();

      ctx.restore();
    },
  });
}

/** Add floating background particles to a scene driven by music metrics */
export function addBackgroundParticles(
  engine: ex.Engine,
  scene: ex.Scene,
  bgDesc: BackgroundDescription,
  bpm: number,
) {
  const count = Math.max(5, Math.min(50, bgDesc.particleCount || 20));
  const baseSpeed = bpm / 120; // normalize around 120 BPM

  for (let i = 0; i < count; i++) {
    const size = 3 + Math.random() * 5;
    const particleGraphic = new ex.Canvas({
      width: size * 3,
      height: size * 3,
      cache: true,
      draw: (ctx) => {
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.random() * 0.25;
        ctx.shadowColor = bgDesc.particleColor;
        ctx.shadowBlur = 4;
        ctx.fillStyle = bgDesc.particleColor;
        const c = (size * 3) / 2;
        drawShape(ctx, bgDesc.particleShape, c, c, size);
        ctx.fill();
        ctx.restore();
      },
    });

    const particle = new ex.Actor({
      x: Math.random() * engine.drawWidth,
      y: Math.random() * engine.drawHeight,
      z: -5,
      collisionType: ex.CollisionType.PreventCollision,
    });
    particle.graphics.use(particleGraphic);

    const vx = (Math.random() - 0.5) * 20 * baseSpeed;
    const vy = -5 - Math.random() * 15 * baseSpeed;
    particle.vel = ex.vec(vx, vy);

    scene.on("preupdate", () => {
      if (particle.pos.y < -20) {
        particle.pos.y = engine.drawHeight + 10;
        particle.pos.x = Math.random() * engine.drawWidth;
      }
      if (particle.pos.x < -20) particle.pos.x = engine.drawWidth + 10;
      if (particle.pos.x > engine.drawWidth + 20) particle.pos.x = -10;
    });

    scene.add(particle);
  }

  // Starfield layer
  if (bgDesc.starfield) {
    for (let i = 0; i < 30; i++) {
      const starSize = 1 + Math.random() * 2;
      const starGraphic = new ex.Canvas({
        width: 6,
        height: 6,
        cache: true,
        draw: (ctx) => {
          ctx.save();
          ctx.globalAlpha = 0.3 + Math.random() * 0.5;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(3, 3, starSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
      const star = new ex.Actor({
        x: Math.random() * engine.drawWidth,
        y: Math.random() * engine.drawHeight,
        z: -8,
        collisionType: ex.CollisionType.PreventCollision,
      });
      star.graphics.use(starGraphic);
      star.vel = ex.vec(0, -2 - Math.random() * 3);

      scene.on("preupdate", () => {
        if (star.pos.y < -5) {
          star.pos.y = engine.drawHeight + 5;
          star.pos.x = Math.random() * engine.drawWidth;
        }
      });

      scene.add(star);
    }
  }
}

/** Generate default asset descriptions from colorPalette when AI doesn't provide them */
export function getDefaultAssets(colorPalette: {
  background: string;
  player: string;
  enemies: string;
  collectibles: string;
  platforms: string;
  accent: string;
}): AssetDescriptions {
  return {
    player: {
      shape: "circle",
      primaryColor: colorPalette.player,
      secondaryColor: colorPalette.accent,
      glowColor: colorPalette.player,
      style: "gradient",
      eyes: true,
    },
    enemies: [
      {
        shape: "diamond",
        primaryColor: colorPalette.enemies,
        secondaryColor: colorPalette.enemies,
        glowColor: colorPalette.enemies,
        style: "neon",
        eyes: true,
      },
      {
        shape: "triangle",
        primaryColor: colorPalette.enemies,
        secondaryColor: colorPalette.enemies,
        glowColor: colorPalette.enemies,
        style: "solid",
        eyes: false,
      },
    ],
    collectible: {
      shape: "star",
      primaryColor: colorPalette.collectibles,
      secondaryColor: colorPalette.accent,
      glowColor: colorPalette.collectibles,
      style: "neon",
      eyes: false,
    },
    platform: {
      style: "gradient",
      primaryColor: colorPalette.platforms,
      accentColor: colorPalette.accent,
    },
    background: {
      particleColor: colorPalette.accent,
      particleShape: "circle",
      particleCount: 20,
      starfield: true,
      ambientColor: colorPalette.accent,
    },
  };
}
