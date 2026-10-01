"use client";

import { useEffect, useRef } from "react";

// Each drop sends a few rings one after another. Ranges are [min, max], picked per drop.
const ECHO = {
  interval: [2200, 4500], maxAuto: 2, radius: [160, 420], life: [4200, 6500],
  rings: [3, 4], stagger: [320, 560], width: 2.4, alpha: 0.34, trail: 46, wakeAlpha: 0.45,
} as const;

type Range = readonly [number, number];
type Drop = { x: number; y: number; auto: boolean; t0: number; R: number; life: number; rings: number; stagger: number };

const rand = ([a, b]: Range) => a + Math.random() * (b - a);
const randInt = ([a, b]: Range) => Math.floor(a + Math.random() * (b - a + 1));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);

export function EchoBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let W = 0, H = 0, dpr = 1, nextAuto = 0, frame = 0;
    const drops: Drop[] = [];

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };

    const addDrop = (x: number, y: number, auto: boolean) => {
      drops.push({ x, y, auto, t0: performance.now(), R: rand(ECHO.radius), life: rand(ECHO.life),
        rings: randInt(ECHO.rings), stagger: rand(ECHO.stagger) });
    };

    // The mean of two randoms leans to the centre, so drops land in the middle as often as near the edges.
    const lean = () => (Math.random() + Math.random()) / 2;

    const draw = (now: number) => {
      const wave = getComputedStyle(canvas).getPropertyValue("--wave").trim();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let k = drops.length - 1; k >= 0; k--) {
        const d = drops[k];
        if (now - d.t0 > d.life + d.stagger * (d.rings - 1)) { drops.splice(k, 1); continue; }
        for (let n = 0; n < d.rings; n++) {
          const t = (now - d.t0 - n * d.stagger) / d.life;
          if (t <= 0 || t >= 1) continue;
          const a = ECHO.alpha * (1 - n * 0.2) * Math.min(1, t / 0.08) * Math.pow(1 - t, 1.6);
          const radius = easeOut(t) * d.R;
          // The wake fades inward behind the crest; it is longest while the ring is still fast.
          const inner = Math.max(0, radius - ECHO.trail * (1 - t * 0.7));
          const wake = ctx.createRadialGradient(d.x, d.y, inner, d.x, d.y, radius);
          wake.addColorStop(0, `rgba(${wave},0)`);
          wake.addColorStop(1, `rgba(${wave},${a * ECHO.wakeAlpha})`);
          ctx.fillStyle = wake;
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          ctx.arc(d.x, d.y, inner, 0, Math.PI * 2, true);
          ctx.fill();
          ctx.strokeStyle = `rgba(${wave},${a})`;
          ctx.lineWidth = Math.max(1, ECHO.width - n * 0.4);
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    const tick = (now: number) => {
      if (now > nextAuto) {
        // Clicks do not count against the auto limit, so a click never pauses the auto drops.
        if (drops.filter((d) => d.auto).length < ECHO.maxAuto) {
          addDrop(W * (0.06 + 0.88 * lean()), H * (0.08 + 0.84 * lean()), true);
          nextAuto = now + rand(ECHO.interval);
        } else {
          nextAuto = now + 300;
        }
      }
      draw(now);
      frame = requestAnimationFrame(tick);
    };

    // The canvas sits behind the page and ignores pointers, so clicks come from the document.
    const onPointer = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button, input, pre, code, nav, [role=tablist]")) return;
      addDrop(e.clientX, e.clientY, false);
    };

    resize();
    addEventListener("resize", resize);
    document.addEventListener("pointerdown", onPointer);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", resize);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
