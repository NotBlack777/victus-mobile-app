import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.tsx';
import { hexToRgb } from '../theme/palettes.ts';
import { BackgroundStyle } from '../types.ts';

const KNOWN_STYLES: BackgroundStyle[] = ['aurora', 'mesh', 'starfield', 'none'];

/**
 * Tracks the OS "reduce motion" preference so the backdrop can stay still for
 * people who ask for that at the system level, independent of the in-app toggle.
 */
function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return prefers;
}

/**
 * Animated backdrop behind the app shell.
 *
 * Performance notes — this layer is always on screen, so it is built to cost
 * nearly nothing while idle:
 *   - the colour fields are radial gradients moved with `transform` only, which
 *     the compositor handles without repainting (no `filter: blur()`, which is
 *     expensive on mobile GPUs);
 *   - the mesh scrolls exactly one grid cell so the loop is seamless;
 *   - the starfield is a canvas that is sized with a capped device pixel ratio,
 *     pauses when the tab is hidden, and is drawn once (not animated) when
 *     motion is reduced.
 */
export const BackgroundFX: React.FC = () => {
  const { config, gradientColors } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();

  const style: BackgroundStyle = KNOWN_STYLES.includes(config.background)
    ? config.background
    : 'aurora';
  const animate = !config.reduceMotion && !prefersReducedMotion;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [accentA, accentB] = gradientColors;
  const rgbA = hexToRgb(accentA);
  const rgbB = hexToRgb(accentB);

  useEffect(() => {
    if (style !== 'starfield') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let stars: { x: number; y: number; r: number; vx: number; vy: number; a: number }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with area but stays capped so large screens stay cheap.
      const count = Math.min(72, Math.max(26, Math.round((width * height) / 9000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.35,
        vx: (Math.random() - 0.5) * 0.09,
        vy: (Math.random() - 0.5) * 0.09,
        a: Math.random() * 0.45 + 0.22,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `rgba(${rgbA}, 0.9)`;
      for (const star of stars) {
        ctx.globalAlpha = star.a;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < -2) star.x = width + 2;
        else if (star.x > width + 2) star.x = -2;
        if (star.y < -2) star.y = height + 2;
        else if (star.y > height + 2) star.y = -2;
      }
      draw();
      frame = requestAnimationFrame(step);
    };

    build();
    draw();
    if (animate) frame = requestAnimationFrame(step);

    const handleResize = () => {
      build();
      draw();
    };

    const handleVisibility = () => {
      if (!animate) return;
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        frame = requestAnimationFrame(step);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [style, animate, rgbA]);

  if (style === 'none') return null;

  return (
    <div className={`bgfx${animate ? '' : ' bgfx-static'}`} aria-hidden="true">
      {style === 'aurora' && (
        <>
          <div
            className="bgfx-blob bgfx-blob-1"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(${rgbA}, 0.32), transparent 68%)`,
            }}
          />
          <div
            className="bgfx-blob bgfx-blob-2"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(${rgbB}, 0.28), transparent 68%)`,
            }}
          />
          <div
            className="bgfx-blob bgfx-blob-3"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(${rgbA}, 0.18), transparent 66%)`,
            }}
          />
        </>
      )}

      {style === 'mesh' && (
        <>
          <div className="bgfx-mesh-wrap">
            <div
              className="bgfx-mesh"
              style={{
                backgroundImage: `linear-gradient(rgba(${rgbA}, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgbA}, 0.16) 1px, transparent 1px)`,
                backgroundSize: '44px 44px',
              }}
            />
          </div>
          <div
            className="bgfx-mesh-glow"
            style={{
              background: `linear-gradient(180deg, rgba(${rgbB}, 0.22), transparent 62%)`,
            }}
          />
        </>
      )}

      {style === 'starfield' && <canvas ref={canvasRef} className="bgfx-canvas" />}
    </div>
  );
};
