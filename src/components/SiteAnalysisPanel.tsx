import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  RefreshCw,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { AnimatedCounter } from '@/src/components/AnimatedCounter';
import {
  LandingSite,
  MissionBriefingResponse,
  SolarEarthState,
} from '@/src/types/mission';

interface SiteAnalysisPanelProps {
  site: LandingSite;
  solarEarthState: SolarEarthState;
  analysisKey: number;
  isAnalyzing: boolean;
  briefing: MissionBriefingResponse | null;
  briefingLoading: boolean;
  briefingError: string | null;
  onRefreshBriefing: () => void;
  onFocusCamera: () => void;
  onExportBrief: () => void;
}

function MetricBar({
  label,
  valueDisplay,
  percent,
  color,
  delay = 0,
}: {
  label: string;
  valueDisplay: string;
  percent: number;
  color: string;
  delay?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-medium text-slate-100">{valueDisplay}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/90">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function SiteAnalysisPanel({
  site,
  solarEarthState,
  analysisKey,
  isAnalyzing,
  briefing,
  briefingLoading,
  briefingError,
  onRefreshBriefing,
  onFocusCamera,
  onExportBrief,
}: SiteAnalysisPanelProps) {
  const riskMeta =
    site.riskLevel === 'safe'
      ? {
          label: 'SAFE',
          color: '#3ff0a5',
          bg: 'bg-[#3ff0a5]/12 border-[#3ff0a5]/35 text-[#3ff0a5]',
          Icon: CheckCircle2,
        }
      : site.riskLevel === 'caution'
      ? {
          label: 'CAUTION',
          color: '#ffc857',
          bg: 'bg-[#ffc857]/12 border-[#ffc857]/35 text-[#ffc857]',
          Icon: AlertTriangle,
        }
      : {
          label: 'HIGH RISK',
          color: '#ff5f7a',
          bg: 'bg-[#ff5f7a]/12 border-[#ff5f7a]/35 text-[#ff5f7a]',
          Icon: ShieldAlert,
        };

  const RiskIcon = riskMeta.Icon;

  return (
    <motion.aside
      key={site.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="mc-panel flex h-full flex-col gap-4 overflow-y-auto rounded-xl p-4"
    >
      {/* Selected Site Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#4be0ff]">
            <span>SITE {site.id}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate text-slate-400">{site.region}</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
            {site.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400">
            <span>{site.lat.toFixed(2)}°S</span>
            <span aria-hidden="true">/</span>
            <span>{site.lon.toFixed(1)}°E</span>
            <span aria-hidden="true">·</span>
            <span>{site.elevationM >= 0 ? `+${site.elevationM.toFixed(0)}` : site.elevationM.toFixed(0)} m</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${riskMeta.bg}`}
          >
            <RiskIcon className="h-3 w-3" />
            {riskMeta.label}
          </span>
          <button
            type="button"
            onClick={onFocusCamera}
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-[#4be0ff] hover:underline"
          >
            <Target className="h-3 w-3" />
            <span>Fly to Site</span>
          </button>
        </div>
      </div>

      {/* Safety Score Hero Readout */}
      <div className="mc-panel-subtle flex items-center justify-between rounded-lg px-3.5 py-3">
        <div>
          <div className="font-mono text-[10px] tracking-wider text-slate-400">
            COMPOSITE SAFETY SCORE
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <AnimatedCounter
              value={isAnalyzing ? 0 : site.safetyScore}
              startFromZeroKey={analysisKey}
              className="text-3xl font-bold text-white"
            />
            <span className="font-mono text-xs text-slate-400">/ 100</span>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] text-slate-400">
          <div>ELLIPSE RADIUS</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-200">
            ±{Math.round(site.ellipseRadiusWorld * 100)} m
          </div>
        </div>
      </div>

      {/* Terrain & Telemetry Bars */}
      <div className="space-y-2.5">
        <div className="font-mono text-[10px] tracking-wider text-slate-400">
          TERRAIN HAZARD &amp; LINK TELEMETRY
        </div>
        <MetricBar
          label="Mean Surface Slope"
          valueDisplay={`${site.slopeDeg.toFixed(1)}°`}
          percent={(site.slopeDeg / 22) * 100}
          color={site.slopeDeg < 8.5 ? '#3ff0a5' : site.slopeDeg < 14.5 ? '#ffc857' : '#ff5f7a'}
          delay={0.05}
        />
        <MetricBar
          label="Surface Roughness (RMS)"
          valueDisplay={`${site.roughnessM.toFixed(2)} m`}
          percent={(site.roughnessM / 0.7) * 100}
          color={site.roughnessM < 0.28 ? '#3ff0a5' : site.roughnessM < 0.48 ? '#ffc857' : '#ff5f7a'}
          delay={0.1}
        />
        <MetricBar
          label="Shadow / PSR Coverage"
          valueDisplay={`${site.shadowCoveragePct.toFixed(0)}%`}
          percent={site.shadowCoveragePct}
          color="#a78bfa"
          delay={0.15}
        />
        <MetricBar
          label="Solar-Power Potential"
          valueDisplay={`${solarEarthState.solarWindowPct.toFixed(0)}%`}
          percent={solarEarthState.solarWindowPct}
          color="#ffc857"
          delay={0.2}
        />
        <MetricBar
          label="Direct-to-Earth Window"
          valueDisplay={`${solarEarthState.commWindowPct.toFixed(0)}%`}
          percent={solarEarthState.commWindowPct}
          color="#5b8cff"
          delay={0.25}
        />
      </div>

      {/* Gemini AI Mission Briefing */}
      <div className="mc-panel-subtle flex flex-col gap-3 rounded-lg p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[#4be0ff]" />
            <h3 className="font-display text-sm font-semibold text-white">
              AI Mission Briefing
            </h3>
          </div>
          <button
            type="button"
            onClick={onRefreshBriefing}
            disabled={briefingLoading}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-slate-300 transition-colors hover:border-[#4be0ff]/50 hover:text-[#4be0ff] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${briefingLoading ? 'animate-spin' : ''}`} />
            <span>{briefingLoading ? 'Generating' : 'Generate Brief'}</span>
          </button>
        </div>

        {briefingLoading && (
          <div className="space-y-2 py-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-800" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-800" />
            <p className="pt-1 font-mono text-[10px] text-[#4be0ff]">
              Synthesizing Gemini flight-director briefing...
            </p>
          </div>
        )}

        {!briefingLoading && briefingError && (
          <div className="rounded-md border border-[#ff5f7a]/35 bg-[#ff5f7a]/10 p-2.5 text-xs text-rose-200">
            <p className="font-medium">Briefing service unavailable</p>
            <p className="mt-1 text-[11px] text-rose-300/85">{briefingError}</p>
          </div>
        )}

        {!briefingLoading && !briefingError && briefing && (
          <div className="space-y-3 text-xs leading-relaxed text-slate-300">
            <div>
              <div className="font-mono text-[10px] tracking-wider text-[#4be0ff]">
                OPERATIONAL RECOMMENDATION
              </div>
              <p className="mt-1 text-slate-200">{briefing.recommendation}</p>
            </div>

            <div>
              <div className="font-mono text-[10px] tracking-wider text-slate-400">
                PRIMARY HAZARDS
              </div>
              <ul className="mt-1 space-y-1">
                {briefing.primary_hazards.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#ffc857]" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-2.5 border-t border-slate-800/80 pt-2.5">
              <div>
                <div className="font-mono text-[10px] tracking-wider text-[#ffc857]">
                  SOLAR POWER ASSESSMENT
                </div>
                <p className="mt-0.5 text-slate-300">{briefing.power_assessment}</p>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-wider text-[#5b8cff]">
                  DTE COMMUNICATION ASSESSMENT
                </div>
                <p className="mt-0.5 text-slate-300">{briefing.communication_assessment}</p>
              </div>
            </div>

            {/* Confidence Meter */}
            <div className="border-t border-slate-800/80 pt-2.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-slate-400">ASSESSMENT CONFIDENCE</span>
                <AnimatedCounter value={briefing.confidence} suffix="%" className="text-[#4be0ff]" />
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#5b8cff] to-[#4be0ff]"
                  style={{ width: `${Math.max(0, Math.min(100, briefing.confidence))}%` }}
                />
              </div>
            </div>

            {briefing.limitations.length > 0 && (
              <div className="border-t border-slate-800/80 pt-2">
                <div className="font-mono text-[10px] tracking-wider text-slate-500">
                  LIMITATIONS
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                  {briefing.limitations.map((lim, i) => (
                    <li key={i}>• {lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!briefingLoading && !briefingError && !briefing && (
          <p className="text-xs text-slate-400">
            Select &ldquo;Generate Brief&rdquo; or run AI Terrain Analysis to produce a Gemini-backed mission assessment for {site.id}.
          </p>
        )}
      </div>

      {/* Export Mission Brief CTA */}
      <button
        type="button"
        onClick={onExportBrief}
        className="mt-auto inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-2.5 font-display text-xs font-semibold tracking-wide text-white transition-colors hover:border-[#4be0ff]/60 hover:bg-[#4be0ff]/10"
      >
        <Download className="h-3.5 w-3.5 text-[#4be0ff]" />
        <span>Export Mission Brief (.md)</span>
      </button>
    </motion.aside>
  );
}
