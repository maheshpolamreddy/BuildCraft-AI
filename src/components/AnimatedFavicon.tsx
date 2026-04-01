"use client";

import { useEffect } from "react";

/** Draw at 100×100 logical units; larger export = sharper in tabs and bookmarks. */
const CANVAS_PX = 96;
const LOGICAL = 100;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawFrame(ctx: CanvasRenderingContext2D, tMs: number) {
  const s = CANVAS_PX / LOGICAL;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, LOGICAL + 1, LOGICAL + 1);

  ctx.fillStyle = "#050505";
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, LOGICAL, LOGICAL, 22);
  ctx.fill();

  const blueGrad = ctx.createLinearGradient(0, 0, LOGICAL, LOGICAL);
  blueGrad.addColorStop(0, "#4facfe");
  blueGrad.addColorStop(1, "#00f2fe");
  const emGrad = ctx.createLinearGradient(0, 0, LOGICAL, LOGICAL);
  emGrad.addColorStop(0, "#34d399");
  emGrad.addColorStop(1, "#10b981");

  ctx.lineJoin = "round";
  ctx.lineWidth = 4.2;

  ctx.strokeStyle = blueGrad;
  ctx.beginPath();
  ctx.moveTo(50, 15);
  ctx.lineTo(85, 35);
  ctx.lineTo(50, 55);
  ctx.lineTo(15, 35);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(15, 35);
  ctx.lineTo(50, 55);
  ctx.lineTo(50, 95);
  ctx.lineTo(15, 75);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = emGrad;
  ctx.beginPath();
  ctx.moveTo(85, 35);
  ctx.lineTo(50, 55);
  ctx.lineTo(50, 95);
  ctx.lineTo(85, 75);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(50, 55);
  ctx.lineTo(50, 25);
  ctx.moveTo(50, 55);
  ctx.lineTo(25, 70);
  ctx.moveTo(50, 55);
  ctx.lineTo(75, 70);
  ctx.stroke();

  const pulse = 0.72 + 0.28 * Math.sin(tMs / 320);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.beginPath();
  ctx.arc(50, 55, 4.2, 0, Math.PI * 2);
  ctx.fill();

  const rot = tMs / 5200;
  ctx.save();
  ctx.translate(50, 55);
  ctx.rotate(rot);
  ctx.translate(-50, -55);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.1;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(50, 55, 35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const dots: [number, number, string][] = [
    [85, 55, "#34d399"],
    [15, 55, "#4facfe"],
    [50, 20, "#ffffff"],
  ];
  for (const [x, y, color] of dots) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Drives the browser tab icon with a canvas animation (static ICO/SVG cannot animate in tabs).
 * Throttled to keep CPU low; uses PNG data URLs compatible with all major browsers.
 */
export default function AnimatedFavicon() {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let link = document.getElementById("favicon-bc-animated") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "favicon-bc-animated";
      link.rel = "icon";
      link.type = "image/png";
      link.setAttribute("sizes", `${CANVAS_PX}x${CANVAS_PX}`);
      document.head.prepend(link);
    }

    const MIN_INTERVAL_MS = 90;
    let last = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < MIN_INTERVAL_MS) return;
      last = now;
      drawFrame(ctx, now);
      link!.href = canvas.toDataURL("image/png");
    };

    drawFrame(ctx, performance.now());
    link.href = canvas.toDataURL("image/png");
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
