import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Award, Check, X } from 'lucide-react';
import { AnimatedCounter } from '@/src/components/AnimatedCounter';
import { computeSolarEarthState } from '@/src/engine/ephemerisEngine';
import { LandingSite, TerrainDataset } from '@/src/types/mission';

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: LandingSite[];
  dataset: TerrainDataset;
  missionDate: string;
  initialSiteAId: string;
  onSelectSiteInViewport: (siteId: string) => void;
}

interface CompareRow {
  label: string;
  unit: string;
  valA: number;
  valB: number;
  max: number;
  higherIsBetter: boolean;
  decimals?: number;
}

export function ComparisonModal({
  isOpen,
  onClose,
  sites,
  dataset,
  missionDate,
  initialSiteAId,
  onSelectSiteInViewport,
}: ComparisonModalProps) {
  const [siteAId, setSiteAId] = useState(initialSiteAId || sites[0]?.id || 'LS-01');
  const [siteBId, setSiteBId] = useState(
    sites.find((s) => s.id !== (initialSiteAId || sites[0]?.id))?.id || sites[1]?.id || 'LS-03'
  );

  const siteA = sites.find((s) => s.id === siteAId) ?? sites[0];
  const siteB = sites.find((s) => s.id === siteBId) ?? sites[1] ?? sites[0];

  const ephemA = useMemo(
    () => (siteA ? computeSolarEarthState(dataset, siteA, missionDate, 0.25) : null),
    [dataset, siteA, missionDate]
  );
  const ephemB = useMemo(
    () => (siteB ? computeSolarEarthState(dataset, siteB, missionDate, 0.25) : null),
    [dataset, siteB, missionDate]
  );

  if (!isOpen || !siteA || !siteB || !ephemA || !ephemB) return null;

  const rows: CompareRow[] = [
    {
      label: 'Safety Score',
      unit: '/100',
      valA: siteA.safetyScore,
      valB: siteB.safetyScore,
      max: 100,
      higherIsBetter: true,
    },
    {
      label: 'Mean Slope',
      unit: '°',
      valA: siteA.slopeDeg,
      valB: siteB.slopeDeg,
      max: 24,
      higherIsBetter: false,
      decimals: 1,
    },
    {
      label: 'Surface Roughness',
      unit: ' m',
      valA: siteA.roughnessM,
      valB: siteB.roughnessM,
      max: 0.75,
      higherIsBetter: false,
      decimals: 2,
    },
    {
      label: 'Shadow Coverage',
      unit: '%',
      valA: siteA.shadowCoveragePct,
      valB: siteB.shadowCoveragePct,
      max: 100,
      higherIsBetter: false,
      decimals: 1,
    },
    {
      label: 'Solar-Power Potential',
      unit: '%',
      valA: ephemA.solarWindowPct,
      valB: ephemB.solarWindowPct,
      max: 100,
      higherIsBetter: true,
      decimals: 1,
    },
    {
      label: 'Communication Window',
      unit: '%',
      valA: ephemA.commWindowPct,
      valB: ephemB.commWindowPct,
      max: 100,
      higherIsBetter: true,
      decimals: 1,
    },
  ];

  // Composite weighted decision score
  const rankA =
    siteA.safetyScore * 0.55 + ephemA.solarWindowPct * 0.25 + ephemA.commWindowPct * 0.2;
  const rankB =
    siteB.safetyScore * 0.55 + ephemB.solarWindowPct * 0.25 + ephemB.commWindowPct * 0.2;

  const winner = rankA >= rankB ? siteA : siteB;
  const runnerUp = rankA >= rankB ? siteB : siteA;
  const winEphem = rankA >= rankB ? ephemA : ephemB;
  const loseEphem = rankA >= rankB ? ephemB : ephemA;
  const scoreGap = Math.abs(winner.safetyScore - runnerUp.safetyScore);
  const solarGap = (winEphem.solarWindowPct - loseEphem.solarWindowPct).toFixed(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Candidate Landing Site Comparison"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="mc-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="h-5 w-5 text-[#4be0ff]" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Candidate Site Comparison
              </h2>
              <p className="font-mono text-[11px] text-slate-400">
                EPOCH {missionDate} · SIDE-BY-SIDE TELEMETRY MATRIX
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-700/80 p-2 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
            aria-label="Close comparison modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6">
          {/* Site Selectors */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="mc-panel-subtle rounded-xl p-3.5">
              <div className="font-mono text-[10px] tracking-wider text-[#4be0ff]">
                CANDIDATE A
              </div>
              <select
                value={siteA.id}
                onChange={(e) => setSiteAId(e.target.value)}
                className="mt-1.5 w-full cursor-pointer rounded-lg border border-slate-700 bg-[#070b15] px-3 py-2 text-sm font-medium text-white outline-none focus:border-[#4be0ff]"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.name} ({s.safetyScore}/100)
                  </option>
                ))}
              </select>
            </div>

            <div className="mc-panel-subtle rounded-xl p-3.5">
              <div className="font-mono text-[10px] tracking-wider text-[#a78bfa]">
                CANDIDATE B
              </div>
              <select
                value={siteB.id}
                onChange={(e) => setSiteBId(e.target.value)}
                className="mt-1.5 w-full cursor-pointer rounded-lg border border-slate-700 bg-[#070b15] px-3 py-2 text-sm font-medium text-white outline-none focus:border-[#a78bfa]"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.name} ({s.safetyScore}/100)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Side-by-Side Animated Metric Bars */}
          <div className="space-y-4">
            {rows.map((row, idx) => {
              const pctA = Math.min(100, (row.valA / row.max) * 100);
              const pctB = Math.min(100, (row.valB / row.max) * 100);
              const aWins = row.higherIsBetter ? row.valA >= row.valB : row.valA <= row.valB;
              const bWins = row.higherIsBetter ? row.valB > row.valA : row.valB < row.valA;

              return (
                <div
                  key={row.label}
                  className="rounded-xl border border-slate-800/80 bg-[#070b16]/80 p-3.5"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{row.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {row.higherIsBetter ? 'HIGHER PREFERRED' : 'LOWER PREFERRED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Site A */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className={aWins ? 'font-semibold text-[#4be0ff]' : 'text-slate-400'}>
                          {siteA.id} {aWins && '· ADVANTAGE'}
                        </span>
                        <AnimatedCounter
                          value={row.valA}
                          decimals={row.decimals ?? 0}
                          suffix={row.unit}
                          className="text-white"
                        />
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctA}%` }}
                          transition={{ duration: 0.65, delay: idx * 0.05 }}
                          className="h-full rounded-full bg-[#4be0ff]"
                        />
                      </div>
                    </div>

                    {/* Site B */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className={bWins ? 'font-semibold text-[#a78bfa]' : 'text-slate-400'}>
                          {siteB.id} {bWins && '· ADVANTAGE'}
                        </span>
                        <AnimatedCounter
                          value={row.valB}
                          decimals={row.decimals ?? 0}
                          suffix={row.unit}
                          className="text-white"
                        />
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctB}%` }}
                          transition={{ duration: 0.65, delay: idx * 0.05 }}
                          className="h-full rounded-full bg-[#a78bfa]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendation Summary */}
          <div className="rounded-xl border border-[#3ff0a5]/30 bg-[#3ff0a5]/8 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Award className="h-5 w-5 text-[#3ff0a5]" />
                <div>
                  <div className="font-mono text-[10px] tracking-wider text-[#3ff0a5]">
                    RECOMMENDED LANDING CANDIDATE
                  </div>
                  <h3 className="font-display text-base font-bold text-white">
                    {winner.id} — {winner.name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectSiteInViewport(winner.id);
                  onClose();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#3ff0a5]/45 bg-[#3ff0a5]/15 px-3.5 py-2 text-xs font-semibold text-[#3ff0a5] transition-colors hover:bg-[#3ff0a5]/25"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Inspect {winner.id} in 3D</span>
              </button>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
              {siteA.id === siteB.id
                ? 'Select two distinct candidate sites to evaluate trade-offs across slope, roughness, solar power, and Direct-to-Earth link margin.'
                : `${winner.id} outperforms ${runnerUp.id} with a ${scoreGap}-point safety margin (mean slope ${winner.slopeDeg.toFixed(1)}° vs ${runnerUp.slopeDeg.toFixed(1)}°), ${Number(solarGap) >= 0 ? `+${solarGap}%` : `${solarGap}%`} solar illumination delta, and ${winEphem.commWindowPct.toFixed(0)}% DTE communication availability on ${missionDate}.`}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
