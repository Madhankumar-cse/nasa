import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import { ArrowRight, Compass, ShieldCheck } from 'lucide-react';

interface IntroSequenceProps {
  onComplete: () => void;
}

export function IntroSequence({ onComplete }: IntroSequenceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const moonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const subtitleRef = useRef<HTMLParagraphElement | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const moonWrapRef = useRef<HTMLDivElement | null>(null);
  const [introProgress, setIntroProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // Render procedural rotating lunar south-pole sphere on lightweight 2D canvas
  useEffect(() => {
    const canvas = moonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 440;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pre-generate deterministic crater features across visible hemisphere
    const craters = Array.from({ length: 46 }, (_, i) => {
      const s1 = Math.sin(i * 19.31) * 43758.54;
      const s2 = Math.sin(i * 73.19) * 29384.21;
      const s3 = Math.sin(i * 41.77) * 14928.73;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);
      return {
        lon: r1 * Math.PI * 2,
        lat: (r2 - 0.5) * Math.PI * 0.88,
        radius: 6 + Math.pow(r3, 2) * 32,
        depth: 0.3 + r3 * 0.6,
      };
    });

    let rot = 0.4;
    let rafId = 0;

    const drawMoon = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const r = 152;

      // Subtle atmospheric / limb scatter halo
      const halo = ctx.createRadialGradient(cx - 28, cy + 36, r * 0.72, cx, cy, r * 1.38);
      halo.addColorStop(0, 'rgba(75, 224, 255, 0.14)');
      halo.addColorStop(0.55, 'rgba(91, 140, 255, 0.06)');
      halo.addColorStop(1, 'rgba(5, 7, 15, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.38, 0, Math.PI * 2);
      ctx.fill();

      // Clip to lunar disk
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      // Base lunar regolith shading with oblique south-pole sunlight
      const baseGrad = ctx.createRadialGradient(cx - 56, cy + 54, 18, cx + 24, cy - 30, r * 1.45);
      baseGrad.addColorStop(0, '#cfd8e3');
      baseGrad.addColorStop(0.45, '#7c8798');
      baseGrad.addColorStop(0.78, '#283244');
      baseGrad.addColorStop(1, '#090d18');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      // Rotating surface craters projected onto sphere
      for (const c of craters) {
        const lon = c.lon + rot;
        const cosLat = Math.cos(c.lat);
        const x3 = cosLat * Math.sin(lon);
        const y3 = Math.sin(c.lat);
        const z3 = cosLat * Math.cos(lon);
        if (z3 <= 0.05) continue;

        const px = cx + x3 * r;
        const py = cy + y3 * r;
        const foreshorten = Math.max(0.25, z3);
        const cr = c.radius * foreshorten;

        // Crater shadow & rim highlight
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(y3, x3) * 0.15);
        ctx.scale(1, 0.72 + foreshorten * 0.28);

        ctx.fillStyle = `rgba(9, 13, 24, ${0.42 * z3 * c.depth})`;
        ctx.beginPath();
        ctx.arc(1.5, -1.5, cr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(226, 232, 240, ${0.18 * z3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-1, 1, cr * 0.96, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
      }

      // South-Pole target reticle near bottom polar region
      const poleY = cy + r * 0.72;
      ctx.strokeStyle = 'rgba(75, 224, 255, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, poleY, 22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(75, 224, 255, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, poleY, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Terminator vignette
      const termGrad = ctx.createRadialGradient(cx - 70, cy + 75, r * 0.45, cx + 35, cy - 35, r * 1.15);
      termGrad.addColorStop(0, 'rgba(5,7,15,0)');
      termGrad.addColorStop(0.7, 'rgba(5,7,15,0.38)');
      termGrad.addColorStop(1, 'rgba(5,7,15,0.92)');
      ctx.fillStyle = termGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      ctx.restore();

      // Outer precision orbital ring
      ctx.strokeStyle = 'rgba(75, 224, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r + 26, (r + 26) * 0.34, -0.18, 0, Math.PI * 2);
      ctx.stroke();

      rot += 0.0024;
      rafId = requestAnimationFrame(drawMoon);
    };

    drawMoon();
    return () => cancelAnimationFrame(rafId);
  }, []);

  // GSAP 3-second cinematic dolly & title choreography
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      tl.fromTo(
        moonWrapRef.current,
        { scale: 0.86, y: 24, opacity: 0 },
        { scale: 1.06, y: -6, opacity: 1, duration: 2.8, ease: 'power2.out' },
        0
      )
        .fromTo(
          titleRef.current,
          { y: 20, opacity: 0, letterSpacing: '0.16em' },
          { y: 0, opacity: 1, letterSpacing: '0.06em', duration: 1.1, ease: 'power3.out' },
          0.35
        )
        .fromTo(
          subtitleRef.current,
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, ease: 'power2.out' },
          0.75
        )
        .fromTo(
          ctaRef.current,
          { y: 12, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out' },
          1.15
        );
    }, containerRef);

    // 3-second mission readiness progress ticker
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - start) / 3000) * 100);
      setIntroProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, []);

  const handleBegin = () => {
    if (isExiting) return;
    setIsExiting(true);
    gsap.to(containerRef.current, {
      opacity: 0,
      scale: 1.03,
      duration: 0.55,
      ease: 'power2.inOut',
      onComplete,
    });
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="relative flex max-w-3xl flex-col items-center">
        {/* Rotating South Pole Lunar Canvas with Dolly Motion */}
        <div ref={moonWrapRef} className="relative mb-6 flex items-center justify-center">
          <canvas
            ref={moonCanvasRef}
            className="h-[260px] w-[260px] sm:h-[320px] sm:w-[320px]"
            aria-label="Rotating Moon South Pole projection"
          />
          <div className="pointer-events-none absolute bottom-4 flex items-center gap-2 font-mono text-[11px] tracking-widest text-[#4be0ff]/90">
            <Compass className="h-3.5 w-3.5" />
            <span>89.5°S · SHACKLETON-MALAPERT SECTOR</span>
          </div>
        </div>

        {/* Mission Kicker */}
        <div className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.22em] text-slate-400">
          <span>NASA SPACE APPS CHALLENGE 2026</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#4be0ff]">SOUTH POLE RECONNAISSANCE</span>
        </div>

        {/* Title */}
        <h1
          ref={titleRef}
          className="font-display text-balance text-3xl font-bold tracking-[0.06em] text-white sm:text-5xl"
        >
          LUNAR LANDING SITE NAVIGATOR
        </h1>

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="mt-4 max-w-xl text-base text-slate-300 sm:text-lg"
        >
          AI terrain intelligence for safer lunar missions
        </p>

        {/* Begin Mission Analysis CTA */}
        <div ref={ctaRef} className="mt-8 flex flex-col items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleBegin}
            className="group inline-flex cursor-pointer items-center gap-3 rounded-xl border border-[#4be0ff]/45 bg-[#4be0ff]/15 px-7 py-3.5 font-display text-sm font-semibold tracking-wider text-white transition-colors hover:bg-[#4be0ff]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4be0ff]"
          >
            <span>Begin Mission Analysis</span>
            <ArrowRight className="h-4 w-4 text-[#4be0ff] transition-transform duration-200 group-hover:translate-x-1" />
          </motion.button>

          {/* 3-second initialization calibration progress */}
          <div className="flex w-64 flex-col items-center gap-1.5">
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-[#5b8cff] to-[#4be0ff] transition-[width] duration-75"
                style={{ width: `${introProgress}%` }}
              />
            </div>
            <div className="flex w-full items-center justify-between font-mono text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-[#3ff0a5]" />
                {introProgress < 100 ? 'CALIBRATING SOUTH POLE DEM' : 'TELEMETRY READY'}
              </span>
              <span>{Math.round(introProgress)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
