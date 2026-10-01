import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.tsx';
import { hexToRgb } from '../theme/palettes.ts';
import { KNOWN_STYLES_FIELD, resolveBackdropLayer } from '../theme/backdrop.ts';
import { BackgroundStyle } from '../types.ts';

const KNOWN_STYLES = KNOWN_STYLES_FIELD;

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
 *
 * Visibility notes — the fields used to be both small and almost transparent,
 * which made a perfectly running animation look like a dead one. Each field now
 * covers the viewport several times over, parks its bright core inside the
 * visible area, and blends with `screen` so it reads as emitted light on the
 * near-black canvas.
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
    let stars: {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      a: number;
      tw: number;
      ts: number;
    }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with area but stays capped so large screens stay cheap.
      // A sparse field reads as a dead screen; this is dense enough to clearly
      // drift while still being a few hundred tiny fills per frame.
      const count = Math.min(240, Math.max(120, Math.round((width * height) / 1400)));
      stars = Array.from({ length: count }, () => {
        // A few brighter anchors carry the field; the rest are fine dust, so
        // the canvas has depth instead of reading as uniform noise.
        const anchor = Math.random() < 0.12;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: anchor ? Math.random() * 1.7 + 1.4 : Math.random() * 1.2 + 0.6,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.5) * 0.34,
          a: anchor ? Math.random() * 0.3 + 0.7 : Math.random() * 0.35 + 0.4,
          tw: Math.random() * Math.PI * 2, // twinkle phase
          ts: Math.random() * 0.02 + 0.006, // twinkle speed
        };
      });
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        // Twinkle keeps the field alive even between the slow drifts.
        const twinkle = 0.68 + 0.32 * Math.sin(t * star.ts + star.tw);
        const alpha = Math.min(1, star.a * twinkle);

        // Anchors get a soft halo so the field has depth instead of reading as
        // flat specks. One extra fill for a small slice of the stars keeps the
        // whole thing cheap.
        if (star.r > 1.5) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillStyle = `rgba(${rgbA}, 1)`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(${star.r > 1.5 ? rgbB : rgbA}, 0.95)`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (t: number) => {
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < -2) star.x = width + 2;
        else if (star.x > width + 2) star.x = -2;
        if (star.y < -2) star.y = height + 2;
        else if (star.y > height + 2) star.y = -2;
      }
      draw(t);
      frame = requestAnimationFrame(step);
    };

    build();
    draw(0);
    if (animate) frame = requestAnimationFrame(step);

    const handleResize = () => {
      build();
      draw(0);
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
  }, [style, animate, rgbA, rgbB]);

  if (style === 'none') return null;

  const layers = resolveBackdropLayer(style, rgbA, rgbB);
  // The grid and its sweep share one mask, so they are wrapped together; the
  // glow sits outside the mask to keep the top of the screen lit.
  const isMesh = style === 'mesh';
  const gridLayers = isMesh ? layers.filter((layer) => !layer.className.includes('glow')) : [];
  const glowLayers = isMesh ? layers.filter((layer) => layer.className.includes('glow')) : [];

  const render = (layer: (typeof layers)[number]) => (
    <div
      key={layer.className}
      className={layer.className}
      style={{ background: layer.background, backgroundSize: layer.backgroundSize }}
    />
  );

  return (
    <div className={`bgfx${animate ? '' : ' bgfx-static'}`} aria-hidden="true">
      {isMesh ? (
        <>
          <div className="bgfx-mesh-wrap">{gridLayers.map(render)}</div>
          {glowLayers.map(render)}
        </>
      ) : (
        layers.map(render)
      )}

      {style === 'starfield' && <canvas ref={canvasRef} className="bgfx-canvas" />}
    </div>
  );
};
