import { useEffect, useRef } from 'react';

/**
 * ASCII soil bed with a sprout germinating out of it, ported from the
 * "Oasis Terminal Grid" reference to a self-contained canvas component.
 *
 * The metaphor is the screen's actual job: a server is planted and grows.
 * Everything is drawn in the monochrome ramp - no colour channel exists in
 * this design, depth is carried by character density and grey level alone.
 */

const CELL = 14;
/** Densest to sparsest; the last entry is a space, so the ramp can fade out. */
const RAMP = ['@', '#', '&', '%', '*', '+', '=', '-', ':', '.', ' '];
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
/** Soil is near-static, so a third of display rate looks identical and costs a third of the CPU in an app that sits open. */
const FPS = 24;
const GROW_MS = 12_000;
const SEED_DELAY_MS = 1_500;

/** Offsets from the root cell, with the progress value at which each block appears. */
const SPROUT: ReadonlyArray<{ x: number; y: number; t: number }> = [
  { x: 0, y: 0, t: 0.05 },
  { x: 0, y: -1, t: 0.1 },
  { x: 0, y: -2, t: 0.15 },
  { x: 0, y: -3, t: 0.2 },
  { x: 0, y: -4, t: 0.25 },
  { x: 0, y: -5, t: 0.3 },
  { x: 0, y: -6, t: 0.35 },
  { x: 0, y: -7, t: 0.4 },
  // left leaf
  { x: -1, y: -4, t: 0.5 },
  { x: -2, y: -5, t: 0.55 },
  { x: -3, y: -5, t: 0.6 },
  { x: -2, y: -4, t: 0.62 },
  // right leaf
  { x: 1, y: -5, t: 0.52 },
  { x: 2, y: -6, t: 0.57 },
  { x: 3, y: -6, t: 0.62 },
  { x: 2, y: -5, t: 0.64 },
  // crown
  { x: -1, y: -8, t: 0.75 },
  { x: 1, y: -8, t: 0.75 },
  { x: 0, y: -9, t: 0.8 },
  { x: -1, y: -10, t: 0.85 },
  { x: 1, y: -10, t: 0.85 },
  { x: 0, y: -11, t: 0.9 },
  { x: 0, y: -13, t: 0.98 },
];

function noise(x: number, y: number, t: number): number {
  return Math.sin(x * 0.1 + t) + Math.cos(y * 0.1 - t) + Math.sin((x + y) * 0.05 + t * 0.5);
}

export function TerminalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cols = 0;
    let rows = 0;
    let frame = 0;
    let raf = 0;
    let lastPaint = 0;
    const startAt = Date.now() + SEED_DELAY_MS;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      // Back the canvas at device resolution, then work in CSS pixels, or
      // every glyph is resampled and the whole grid turns to mush on HiDPI.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${CELL}px ${MONO}`;
      ctx.textBaseline = 'top';
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(height / CELL);
    };

    const paint = (time: number) => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width / dpr, height / dpr);

      // Reduced motion gets the finished plant, not a frozen seed.
      const progress = still ? 1 : Math.min(Math.max((Date.now() - startAt) / GROW_MS, 0), 1);

      const soilTop = Math.floor(rows * 0.65);
      const rootX = Math.floor(cols / 2);

      for (let x = 0; x < cols; x++) {
        const surface = Math.floor(
          soilTop + Math.sin(x * 0.1 + time * 0.02) * 2 + Math.cos(x * 0.05) * 2,
        );
        for (let y = surface; y < rows; y++) {
          const depth = y - surface;
          const flow = noise(x, y, time * 0.03);
          let index = Math.floor(depth * 0.5 + flow * 3 + 2);
          index = Math.max(0, Math.min(index, RAMP.length - 2));

          // Hollow out a pocket around the root so the sprout reads as
          // emerging from the soil rather than pasted on top of it.
          let alpha = 1;
          if (progress > 0.1) {
            const dx = x - rootX;
            const dy = y - surface;
            if (Math.sqrt(dx * dx + dy * dy) < 3) {
              alpha = 0.2;
              index = RAMP.length - 2;
            }
          }

          const level = depth < 2 ? 85 : depth < 6 ? 51 : 17;
          ctx.fillStyle = `rgba(${level},${level},${level},${alpha})`;
          ctx.fillText(RAMP[index] ?? ' ', x * CELL, y * CELL);
        }
      }

      if (progress > 0) {
        ctx.fillStyle = '#fff';
        const rootY = Math.floor(
          soilTop + Math.sin(rootX * 0.1 + time * 0.02) * 2 + Math.cos(rootX * 0.05) * 2,
        );
        for (const block of SPROUT) {
          if (progress < block.t) continue;
          // Only the upper half sways; the stem base stays planted.
          const sway =
            !still && block.y < -4 ? Math.round(Math.sin(time * 0.05 + block.y * 0.1) * 0.6) : 0;
          ctx.fillRect(
            (rootX + block.x + sway) * CELL + 1,
            (rootY + block.y) * CELL + 1,
            CELL - 2,
            CELL - 2,
          );
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastPaint < 1000 / FPS) return;
      lastPaint = now;
      paint(frame++);
    };

    const observer = new ResizeObserver(() => {
      resize();
      paint(frame);
    });
    observer.observe(host);

    resize();
    if (still) {
      paint(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="term-canvas" aria-hidden="true" />;
}
