import { motion } from 'framer-motion';
import { Calendar, Pause, Play, Radio, Sun } from 'lucide-react';
import { LandingSite, SolarEarthState } from '@/src/types/mission';

interface SunEarthTheaterProps {
  site: LandingSite;
  missionDate: string;
  onChangeDate: (date: string) => void;
  cycleProgress: number; // 0..1
  onChangeCycleProgress: (value: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  solarEarthState: SolarEarthState;
}

export function SunEarthTheater({
  site,
  missionDate,
  onChangeDate,
  cycleProgress,
  onChangeCycleProgress,
  isPlaying,
  onTogglePlay,
  solarEarthState,
}: SunEarthTheaterProps) {
  const width = 760;
  const height = 210;
  const horizonBaselineY = 148;
  const minEl = -8;
  const maxEl = 14;

  const azToX = (az: number) => (((az % 360) + 360) % 360) / 360 * width;
  const elToY = (el: number) => {
    const norm = (el - minEl) / (maxEl - minEl);
    return height - 22 - Math.max(-0.08, Math.min(1.05, norm)) * (height - 46);
  };

  // Build SVG path for the 360-degree terrain horizon silhouette
  const horizonPath = (() => {
    const pts = solarEarthState.horizonProfile;
    if (pts.length === 0) return '';
    const coords = pts.map((p) => `${azToX(p.azimuthDeg).toFixed(1)},${elToY(p.horizonElevationDeg).toFixed(1)}`);
    const lastY = elToY(pts[0].horizonElevationDeg).toFixed(1);
    return `M 0,${height} L ${coords.join(' L ')} L ${width},${lastY} L ${width},${height} Z`;
  })();

  const horizonStrokePath = (() => {
    const pts = solarEarthState.horizonProfile;
    if (pts.length === 0) return '';
    const coords = pts.map((p) => `${azToX(p.azimuthDeg).toFixed(1)},${elToY(p.horizonElevationDeg).toFixed(1)}`);
    const lastY = elToY(pts[0].horizonElevationDeg).toFixed(1);
    return `M ${coords.join(' L ')} L ${width},${lastY}`;
  })();

  // Build smooth Sun elevation trajectory curve across the full 29.5-day cycle
  const sunArcPath = (() => {
    const samples = solarEarthState.timeline;
    if (samples.length === 0) return '';
    const sorted = [...samples].sort((a, b) => a.sunAzimuthDeg - b.sunAzimuthDeg);
    return (
      'M ' +
      sorted
        .map((s) => `${azToX(s.sunAzimuthDeg).toFixed(1)},${elToY(s.sunElevationDeg).toFixed(1)}`)
        .join(' L ')
    );
  })();

  const sunX = azToX(solarEarthState.sunAzimuthDeg);
  const sunY = elToY(solarEarthState.sunElevationDeg);
  const earthX = azToX(solarEarthState.earthAzimuthDeg);
  const earthY = elToY(solarEarthState.earthElevationDeg);

  // Lander silhouette perched at central ridge reference
  const landerX = width * 0.5;
  const landerY = horizonBaselineY + 26;

  const currentDay = (cycleProgress * 29.53).toFixed(1);

  return (
    <section className="mc-panel flex flex-col gap-3 rounded-xl p-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold tracking-wide text-white">
              Sun &amp; Earth Horizon Theater
            </h2>
            <span className="font-mono text-[11px] text-slate-400">
              {site.id} · {site.name}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            360° terrain horizon mask · Solar elevation &amp; Direct-to-Earth optical link
          </p>
        </div>

        {/* Date Picker + Playback Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#080d1a] px-2.5 py-1.5 text-xs text-slate-200">
            <Calendar className="h-3.5 w-3.5 text-[#4be0ff]" />
            <input
              type="date"
              value={missionDate}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              className="cursor-pointer bg-transparent font-mono text-xs text-slate-100 outline-none"
              aria-label="Mission epoch date"
            />
          </label>

          <button
            type="button"
            onClick={onTogglePlay}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#4be0ff]/35 bg-[#4be0ff]/10 px-3 py-1.5 text-xs font-medium text-[#4be0ff] transition-colors hover:bg-[#4be0ff]/20"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play Cycle'}</span>
          </button>
        </div>
      </div>

      {/* Interactive SVG Horizon Theater */}
      <div className="relative overflow-hidden rounded-lg border border-slate-800/90 bg-[#040710]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[175px] w-full sm:h-[195px]"
          role="img"
          aria-label="Lunar South Pole horizon elevation profile with Sun and Earth beams"
        >
          <defs>
            <linearGradient id="skyGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#070d1f" />
              <stop offset="65%" stopColor="#0a1226" />
              <stop offset="100%" stopColor="#050811" />
            </linearGradient>
            <linearGradient id="terrainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#162033" />
              <stop offset="100%" stopColor="#050811" />
            </linearGradient>
            <radialGradient id="sunHalo">
              <stop offset="0%" stopColor="#ffe49e" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#ffc857" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ffc857" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="earthHalo">
              <stop offset="0%" stopColor="#7eb6ff" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#5b8cff" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5b8cff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="url(#skyGlow)" />

          {/* Elevation degree reference lines */}
          {[0, 5, 10].map((deg) => {
            const y = elToY(deg);
            return (
              <g key={deg}>
                <line
                  x1="0"
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={deg === 0 ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.09)'}
                  strokeDasharray={deg === 0 ? '4 4' : '2 6'}
                />
                <text
                  x="8"
                  y={y - 4}
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {deg > 0 ? `+${deg}°` : '0° HORIZON'}
                </text>
              </g>
            );
          })}

          {/* Azimuth compass ticks */}
          {[
            { az: 0, label: '0° N' },
            { az: 90, label: '90° E' },
            { az: 180, label: '180° S' },
            { az: 270, label: '270° W' },
          ].map((t) => {
            const x = azToX(t.az);
            return (
              <g key={t.az}>
                <line x1={x} y1="8" x2={x} y2={height - 16} stroke="rgba(148,163,184,0.08)" />
                <text
                  x={x + 4}
                  y="16"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* Solar Trajectory Path */}
          {sunArcPath && (
            <path
              d={sunArcPath}
              fill="none"
              stroke="rgba(255, 200, 87, 0.24)"
              strokeWidth="1.2"
              strokeDasharray="3 4"
            />
          )}

          {/* Glowing Solar Beam (when Sun clears terrain horizon) */}
          {solarEarthState.isSunVisible && (
            <g>
              <line
                x1={sunX}
                y1={sunY}
                x2={landerX}
                y2={landerY}
                stroke="rgba(255, 200, 87, 0.22)"
                strokeWidth="10"
              />
              <line
                x1={sunX}
                y1={sunY}
                x2={landerX}
                y2={landerY}
                stroke="#ffc857"
                strokeWidth="1.8"
                strokeDasharray="6 4"
              />
            </g>
          )}

          {/* Blue Direct-to-Earth Communication Beam (when Earth clears terrain horizon) */}
          {solarEarthState.isEarthVisible && (
            <g>
              <line
                x1={landerX}
                y1={landerY}
                x2={earthX}
                y2={earthY}
                stroke="rgba(91, 140, 255, 0.24)"
                strokeWidth="7"
              />
              <line
                x1={landerX}
                y1={landerY}
                x2={earthX}
                y2={earthY}
                stroke="#5b8cff"
                strokeWidth="1.6"
                strokeDasharray="4 4"
              />
            </g>
          )}

          {/* Sun Orb */}
          <g style={{ transition: 'transform 120ms linear' }}>
            <circle
              cx={sunX}
              cy={sunY}
              r={solarEarthState.isSunVisible ? 26 : 14}
              fill="url(#sunHalo)"
              opacity={solarEarthState.isSunVisible ? 0.95 : 0.35}
            />
            <circle
              cx={sunX}
              cy={sunY}
              r={7.5}
              fill={solarEarthState.isSunVisible ? '#ffe6a3' : '#785e2a'}
              stroke="#ffc857"
              strokeWidth="1.2"
            />
            <text
              x={Math.min(width - 42, Math.max(12, sunX + 12))}
              y={Math.max(24, sunY - 8)}
              fill="#ffc857"
              fontSize="9.5"
              fontFamily="JetBrains Mono, monospace"
            >
              SUN {solarEarthState.sunElevationDeg >= 0 ? '+' : ''}
              {solarEarthState.sunElevationDeg.toFixed(1)}°
            </text>
          </g>

          {/* Earth Orb */}
          <g>
            <circle
              cx={earthX}
              cy={earthY}
              r={20}
              fill="url(#earthHalo)"
              opacity={solarEarthState.isEarthVisible ? 0.9 : 0.35}
            />
            <circle
              cx={earthX}
              cy={earthY}
              r={6.5}
              fill={solarEarthState.isEarthVisible ? '#5b8cff' : '#263866'}
              stroke="#93c5fd"
              strokeWidth="1.1"
            />
            <text
              x={Math.min(width - 56, Math.max(12, earthX + 11))}
              y={Math.max(24, earthY - 8)}
              fill="#93c5fd"
              fontSize="9.5"
              fontFamily="JetBrains Mono, monospace"
            >
              EARTH {solarEarthState.earthElevationDeg >= 0 ? '+' : ''}
              {solarEarthState.earthElevationDeg.toFixed(1)}°
            </text>
          </g>

          {/* Dark Lunar Terrain Horizon Silhouette (masks bodies below ridge) */}
          <path d={horizonPath} fill="url(#terrainFill)" opacity="0.96" />
          <path d={horizonStrokePath} fill="none" stroke="#334155" strokeWidth="1.4" />

          {/* Lander Marker at Horizon Base */}
          <g transform={`translate(${landerX}, ${landerY})`}>
            <polygon points="-8,8 8,8 5,0 -5,0" fill="#1e293b" stroke="#4be0ff" strokeWidth="1" />
            <line x1="0" y1="0" x2="0" y2="-7" stroke="#4be0ff" strokeWidth="1.2" />
            <circle cx="0" cy="-8" r="2" fill="#4be0ff" />
          </g>
        </svg>
      </div>

      {/* Timeline Scrubber & Window Telemetry */}
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
        <div className="flex flex-col gap-1.5 lg:col-span-7">
          <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
            <span>LUNAR SYNODIC TIMELINE · DAY +{currentDay} / 29.5d</span>
            <span>AZ {solarEarthState.sunAzimuthDeg.toFixed(0)}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.004}
            value={cycleProgress}
            onChange={(e) => onChangeCycleProgress(Number(e.target.value))}
            className="mc-slider w-full cursor-pointer"
            aria-label="Lunar synodic cycle timeline scrubber"
          />
          {/* Mini timeline visibility strip */}
          <div className="grid grid-cols-24 gap-0.5 pt-0.5">
            {solarEarthState.timeline.map((sample) => (
              <button
                key={sample.step}
                type="button"
                onClick={() => onChangeCycleProgress(sample.step / 24)}
                title={`Day +${sample.dayOffset}d · Sun ${sample.sunVisible ? 'Lit' : 'Shadow'} · DTE ${sample.earthVisible ? 'Lock' : 'Blocked'}`}
                className={`h-1.5 cursor-pointer rounded-[1px] transition-opacity ${
                  sample.sunVisible && sample.earthVisible
                    ? 'bg-[#3ff0a5]/85'
                    : sample.sunVisible
                    ? 'bg-[#ffc857]/80'
                    : sample.earthVisible
                    ? 'bg-[#5b8cff]/75'
                    : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Live Solar & DTE Status Metrics */}
        <div className="grid grid-cols-2 gap-2.5 lg:col-span-5">
          <motion.div
            layout
            className="mc-panel-subtle flex items-center justify-between rounded-lg px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                <Sun className="h-3 w-3 text-[#ffc857]" />
                <span>SOLAR POWER</span>
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-white">
                {solarEarthState.solarWindowPct.toFixed(0)}%{' '}
                <span className="text-[11px] font-normal text-slate-400">
                  ({solarEarthState.solarWindowHours.toFixed(0)}h)
                </span>
              </div>
            </div>
            <span
              className={`font-mono text-[10px] font-semibold ${
                solarEarthState.isSunVisible ? 'text-[#3ff0a5]' : 'text-slate-500'
              }`}
            >
              {solarEarthState.isSunVisible ? `${solarEarthState.solarIrradianceWm2} W/m²` : 'SHADOW'}
            </span>
          </motion.div>

          <motion.div
            layout
            className="mc-panel-subtle flex items-center justify-between rounded-lg px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                <Radio className="h-3 w-3 text-[#5b8cff]" />
                <span>DTE COMM</span>
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-white">
                {solarEarthState.commWindowPct.toFixed(0)}%{' '}
                <span className="text-[11px] font-normal text-slate-400">
                  ({solarEarthState.commWindowHours.toFixed(0)}h)
                </span>
              </div>
            </div>
            <span
              className={`font-mono text-[10px] font-semibold ${
                solarEarthState.isEarthVisible ? 'text-[#4be0ff]' : 'text-[#ff5f7a]'
              }`}
            >
              {solarEarthState.isEarthVisible
                ? `+${solarEarthState.linkMarginDb.toFixed(1)} dB`
                : 'OCCLUDED'}
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
