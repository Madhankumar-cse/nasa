import { useEffect, useRef } from 'react';

interface StarfieldBackgroundProps {
  performanceMode?: boolean;
}

export function StarfieldBackground({ performanceMode = false }: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseOffsetRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const dpr = performanceMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const starCount = performanceMode ? 90 : 210;
    const stars = Array.from({ length: starCount }, (_, i) => {
      const seed1 = Math.sin(i * 12.9898) * 43758.5453;
      const seed2 = Math.sin(i * 78.233) * 29431.1234;
      const seed3 = Math.sin(i * 39.425) * 19482.5123;
      const r1 = seed1 - Math.floor(seed1);
      const r2 = seed2 - Math.floor(seed2);
      const r3 = seed3 - Math.floor(seed3);
      return {
        x: r1 * width,
        y: r2 * height,
        depth: 0.25 + r3 * 0.75,
        radius: 0.55 + r3 * 1.15,
        alpha: 0.2 + r3 * 0.65,
        tint: i % 9 === 0 ? '#9ed8ff' : i % 13 === 0 ? '#c4b5fd' : '#e2e8f0',
      };
    });

    const handlePointerMove = (e: PointerEvent) => {
      const nx = e.clientX / Math.max(1, width) - 0.5;
      const ny = e.clientY / Math.max(1, height) - 0.5;
      mouseOffsetRef.current.targetX = nx * 24;
      mouseOffsetRef.current.targetY = ny * 18;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    let rafId = 0;
    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const m = mouseOffsetRef.current;
      m.x += (m.targetX - m.x) * 0.04;
      m.y += (m.targetY - m.y) * 0.04;
      time += 0.008;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const px = ((s.x - m.x * s.depth + width) % width);
        const py = ((s.y - m.y * s.depth + height) % height);
        const twinkle = prefersReducedMotion ? 1 : 0.8 + 0.2 * Math.sin(time * (0.8 + s.depth) + i);
        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(px, py, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!prefersReducedMotion && !performanceMode) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [performanceMode]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#05070f]">
      {/* Subtle deep-space nebula gradients */}
      <div
        className="absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full opacity-25"
        style={{
          background:
            'radial-gradient(circle, rgba(91,140,255,0.28) 0%, rgba(75,224,255,0.08) 42%, transparent 72%)',
        }}
      />
      <div
        className="absolute -bottom-48 -right-32 h-[620px] w-[620px] rounded-full opacity-20"
        style={{
          background:
            'radial-gradient(circle, rgba(167,139,250,0.26) 0%, rgba(91,140,255,0.08) 44%, transparent 72%)',
        }}
      />
      {/* Starfield canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Fine grid and subtle organic noise */}
      <div className="mc-grid-bg absolute inset-0 opacity-65" />
      <div className="mc-noise absolute inset-0" />
    </div>
  );
}
