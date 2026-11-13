import { Component, ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Compass,
  Database,
  Eye,
  Gauge,
  Layers,
  Orbit,
  Radar,
  ScanLine,
} from 'lucide-react';
import { AnimatedCounter } from '@/src/components/AnimatedCounter';
import { ComparisonModal } from '@/src/components/ComparisonModal';
import { DataTransparencyModal } from '@/src/components/DataTransparencyModal';
import { IntroSequence } from '@/src/components/IntroSequence';
import { SiteAnalysisPanel } from '@/src/components/SiteAnalysisPanel';
import { StarfieldBackground } from '@/src/components/StarfieldBackground';
import { SunEarthTheater } from '@/src/components/SunEarthTheater';
import { computeSolarEarthState } from '@/src/engine/ephemerisEngine';
import { generateSyntheticTerrain } from '@/src/engine/terrainEngine';
import {
  HazardLayersState,
  MissionBriefingResponse,
  TerrainDataset,
} from '@/src/types/mission';
import { exportMissionBriefFile } from '@/src/utils/exportBrief';

const LunarTerrainViewport = lazy(() => import('@/src/components/LunarTerrainViewport'));

class ViewportErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#070b15] p-6 text-center">
          <p className="font-display text-base font-semibold text-white">
            3D Terrain Renderer Fallback
          </p>
          <p className="mt-2 max-w-md text-xs text-slate-400">
            WebGL initialization encountered an environment limitation ({this.state.errorMsg}). Telemetry, horizon theater, comparison, and Gemini briefing remain fully operational.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [dataset, setDataset] = useState<TerrainDataset>(() => generateSyntheticTerrain(112, 80));
  const [selectedSiteId, setSelectedSiteId] = useState<string>('LS-01');
  const [missionDate, setMissionDate] = useState<string>('2026-11-18');
  const [cycleProgress, setCycleProgress] = useState<number>(0.18);
  const [isPlayingCycle, setIsPlayingCycle] = useState<boolean>(false);

  // Hazard layer toggles
  const [hazardLayers, setHazardLayers] = useState<HazardLayersState>({
    safeZones: true,
    cautionZones: true,
    highRiskZones: true,
    contourLines: true,
    craterRims: true,
    boulderMarkers: true,
    siteMarkers: true,
  });

  // AI Terrain Analysis animation state
  const [analysisRevealed, setAnalysisRevealed] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(1);
  const [analysisKey, setAnalysisKey] = useState<number>(1);
  const [scanStageText, setScanStageText] = useState<string>('');

  // Performance & Camera toggles
  const [performanceMode, setPerformanceMode] = useState<boolean>(false);
  const [idleOrbit, setIdleOrbit] = useState<boolean>(true);
  const [cameraFocusNonce, setCameraFocusNonce] = useState<number>(0);

  // Modals
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [showDataModal, setShowDataModal] = useState<boolean>(false);

  // Gemini AI Mission Briefing cache by site+date+source
  const [briefingMap, setBriefingMap] = useState<Record<string, MissionBriefingResponse>>({});
  const [briefingLoading, setBriefingLoading] = useState<boolean>(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const rankedSites = useMemo(
    () => [...dataset.sites].sort((a, b) => b.safetyScore - a.safetyScore),
    [dataset.sites]
  );

  const selectedSite = useMemo(
    () => dataset.sites.find((s) => s.id === selectedSiteId) ?? rankedSites[0],
    [dataset.sites, selectedSiteId, rankedSites]
  );

  const solarEarthState = useMemo(
    () => computeSolarEarthState(dataset, selectedSite, missionDate, cycleProgress),
    [dataset, selectedSite, missionDate, cycleProgress]
  );

  // Playback loop for Sun & Earth synodic cycle
  useEffect(() => {
    if (!isPlayingCycle) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCycleProgress((prev) => (prev + dt * 0.055) % 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingCycle]);

  const briefCacheKey = `${selectedSite.id}::${missionDate}::${dataset.sourceName}`;
  const activeBriefing = briefingMap[briefCacheKey] ?? null;

  const fetchGeminiBriefing = useCallback(
    async (force = false) => {
      if (!force && briefingMap[briefCacheKey]) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setBriefingLoading(true);
      setBriefingError(null);

      try {
        const res = await fetch('/api/briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            site: {
              id: selectedSite.id,
              name: selectedSite.name,
              region: selectedSite.region,
              lat: selectedSite.lat,
              lon: selectedSite.lon,
              elevationM: selectedSite.elevationM,
              safetyScore: selectedSite.safetyScore,
              riskLevel: selectedSite.riskLevel,
              slopeDeg: selectedSite.slopeDeg,
              roughnessM: selectedSite.roughnessM,
              shadowCoveragePct: selectedSite.shadowCoveragePct,
              solarPowerPct: solarEarthState.solarWindowPct,
              commWindowPct: solarEarthState.commWindowPct,
              boulderDensity: selectedSite.boulderDensity,
              craterProximityM: selectedSite.craterProximityM,
            },
            missionDate,
            solarEarthSummary: {
              sunElevationDeg: solarEarthState.sunElevationDeg,
              earthElevationDeg: solarEarthState.earthElevationDeg,
              isSunVisible: solarEarthState.isSunVisible,
              isEarthVisible: solarEarthState.isEarthVisible,
              solarWindowHours: solarEarthState.solarWindowHours,
              commWindowHours: solarEarthState.commWindowHours,
            },
            dataSource: {
              sourceType: dataset.sourceType,
              sourceName: dataset.sourceName,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Request failed with status ${res.status}`);
        }
        setBriefingMap((prev) => ({ ...prev, [briefCacheKey]: data }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setBriefingError(
          err instanceof Error ? err.message : 'Unable to reach AI Mission Briefing endpoint.'
        );
      } finally {
        setBriefingLoading(false);
      }
    },
    [briefCacheKey, briefingMap, selectedSite, solarEarthState, missionDate, dataset.sourceType, dataset.sourceName]
  );

  // Auto-generate Gemini brief after intro completes and when switching site/date
  useEffect(() => {
    if (showIntro) return;
    fetchGeminiBriefing(false);
  }, [showIntro, briefCacheKey, fetchGeminiBriefing]);

  // Run AI Terrain Analysis sweeping scan animation
  const runTerrainAnalysis = () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisRevealed(false);
    setScanProgress(0);
    setScanStageText('Analyzing terrain · Evaluating surface slope gradients...');

    const start = performance.now();
    const duration = 2600;
    let rafId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setScanProgress(t);

      if (t < 0.34) {
        setScanStageText('Analyzing terrain · Computing slope & RMS roughness...');
      } else if (t < 0.68) {
        setScanStageText('Analyzing terrain · Mapping PSR shadows & boulder hazards...');
      } else {
        setScanStageText('Analyzing terrain · Ranking candidate landing ellipses...');
      }

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setIsAnalyzing(false);
        setAnalysisRevealed(true);
        setScanStageText('');
        setAnalysisKey((k) => k + 1);
        setSelectedSiteId(rankedSites[0].id);
        setCameraFocusNonce((n) => n + 1);
        fetchGeminiBriefing(true);
      }
    };

    rafId = requestAnimationFrame(step);
  };

  const toggleLayer = (key: keyof HazardLayersState) => {
    setHazardLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setCameraFocusNonce((n) => n + 1);
  };

  const handleDatasetReplace = (newDs: TerrainDataset) => {
    setDataset(newDs);
    setBriefingMap({});
    setAnalysisKey((k) => k + 1);
    setCameraFocusNonce((n) => n + 1);
  };

  const handleApplySurfaceTexture = (url: string) => {
    setDataset((prev) => ({ ...prev, customAlbedoUrl: url }));
  };

  const handleResetSynthetic = () => {
    setDataset(generateSyntheticTerrain(112, 80));
    setBriefingMap({});
    setSelectedSiteId('LS-01');
    setAnalysisKey((k) => k + 1);
    setCameraFocusNonce((n) => n + 1);
  };

  const layerControls: { key: keyof HazardLayersState; label: string; color: string }[] = [
    { key: 'safeZones', label: 'Safe Zones', color: '#3ff0a5' },
    { key: 'cautionZones', label: 'Caution Zones', color: '#ffc857' },
    { key: 'highRiskZones', label: 'High-Risk Zones', color: '#ff5f7a' },
    { key: 'contourLines', label: 'Elevation Contours', color: '#4be0ff' },
    { key: 'craterRims', label: 'Crater Rims', color: '#a78bfa' },
    { key: 'boulderMarkers', label: 'Hazard Beacons', color: '#ff5f7a' },
    { key: 'siteMarkers', label: 'Landing Sites', color: '#4be0ff' },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#05070f] text-slate-100">
      <StarfieldBackground performanceMode={performanceMode} />

      <AnimatePresence>
        {showIntro && <IntroSequence onComplete={() => setShowIntro(false)} />}
      </AnimatePresence>

      {!showIntro && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 mx-auto flex min-h-screen max-w-[1640px] flex-col gap-3 p-3 sm:p-4"
        >
          {/* Top Bar (Clean 3-Zone Contract) */}
          <header className="mc-panel flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-2.5 sm:px-5">
            {/* Zone 1: Brand Wordmark */}
            <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <Compass className="h-5 w-5 text-[#4be0ff]" />
              <span className="font-display text-base font-bold tracking-tight text-white sm:text-lg">
                Lunar Landing Site Navigator
              </span>
            </div>

            {/* Zone 2: Concise Single-Line Workspace Navigation */}
            <nav className="flex flex-wrap items-center gap-2 sm:gap-5">
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-[#4be0ff] whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span>Compare Sites</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDataModal(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-[#4be0ff] whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Data &amp; Assumptions</span>
              </button>

              <button
                type="button"
                onClick={() => setIdleOrbit((v) => !v)}
                className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  idleOrbit ? 'text-[#4be0ff]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Orbit className="h-3.5 w-3.5" />
                <span>Idle Orbit</span>
              </button>

              <button
                type="button"
                onClick={() => setPerformanceMode((v) => !v)}
                className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  performanceMode ? 'text-[#3ff0a5]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Gauge className="h-3.5 w-3.5" />
                <span>Performance Mode</span>
              </button>
            </nav>

            {/* Zone 3: Primary Mission Action */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={runTerrainAnalysis}
                disabled={isAnalyzing}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#4be0ff]/55 bg-[#4be0ff]/15 px-4 py-2 font-display text-xs font-semibold tracking-wide text-white transition-colors hover:bg-[#4be0ff]/25 disabled:cursor-wait disabled:opacity-70 whitespace-nowrap shrink-0"
              >
                <Radar className={`h-3.5 w-3.5 text-[#4be0ff] ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isAnalyzing ? 'Analyzing Terrain...' : 'Run AI Terrain Analysis'}</span>
              </button>
            </div>
          </header>

          {/* Main Asymmetric Mission Control Workspace */}
          <main className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Left Column: Ranked Candidate Sites + Overlay Layer Matrix */}
            <div className="flex flex-col gap-3 lg:col-span-3 xl:col-span-2">
              {/* Candidate Sites Ranking */}
              <section className="mc-panel flex flex-col gap-2.5 rounded-xl p-3.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h2 className="font-display text-xs font-semibold tracking-wide text-white">
                    Candidate Sites
                  </h2>
                  <span className="font-mono text-[10px] text-slate-400">
                    {rankedSites.length} RANKED
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {rankedSites.map((site, idx) => {
                    const isSelected = site.id === selectedSite.id;
                    const riskColor =
                      site.riskLevel === 'safe'
                        ? '#3ff0a5'
                        : site.riskLevel === 'caution'
                        ? '#ffc857'
                        : '#ff5f7a';
                    const riskText =
                      site.riskLevel === 'safe'
                        ? 'SAFE'
                        : site.riskLevel === 'caution'
                        ? 'CAUTION'
                        : 'HIGH RISK';

                    return (
                      <motion.button
                        key={site.id}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.04 }}
                        onClick={() => handleSelectSite(site.id)}
                        className={`flex w-full cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                          isSelected
                            ? 'border-[#4be0ff]/75 bg-[#4be0ff]/10'
                            : 'border-slate-800/90 bg-[#080d1a]/80 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-[#4be0ff]">
                            #{idx + 1} · {site.id}
                          </span>
                          <AnimatedCounter
                            value={isAnalyzing ? 0 : site.safetyScore}
                            startFromZeroKey={analysisKey}
                            className="text-sm font-bold text-white"
                          />
                        </div>
                        <div className="truncate text-xs font-medium text-slate-200">
                          {site.name}
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                          <span>Slope {site.slopeDeg.toFixed(1)}°</span>
                          <span style={{ color: riskColor }}>{riskText}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              {/* Terrain Hazard & Overlay Layer Toggles */}
              <section className="mc-panel flex flex-col gap-2 rounded-xl p-3.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[#4be0ff]" />
                    <h2 className="font-display text-xs font-semibold tracking-wide text-white">
                      Terrain Layers
                    </h2>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                </div>

                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                  {layerControls.map((layer) => {
                    const active = hazardLayers[layer.key];
                    return (
                      <button
                        key={layer.key}
                        type="button"
                        onClick={() => toggleLayer(layer.key)}
                        className={`flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                          active
                            ? 'border-slate-700 bg-slate-900/90 text-slate-100'
                            : 'border-slate-800/60 bg-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: active ? layer.color : '#334155',
                            }}
                          />
                          <span className="truncate">{layer.label}</span>
                        </span>
                        <span className="font-mono text-[10px]">
                          {active ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Center Stage: 3D Lunar Terrain Inspector + Sun/Earth Horizon Theater */}
            <div className="flex min-w-0 flex-col gap-3 lg:col-span-6 xl:col-span-7">
              {/* 3D Terrain Canvas Container */}
              <div className="relative h-[420px] min-h-[380px] flex-1 sm:h-[490px] lg:h-[520px]">
                <ViewportErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="mc-panel flex h-full w-full flex-col items-center justify-center rounded-xl">
                        <ScanLine className="h-7 w-7 animate-pulse text-[#4be0ff]" />
                        <p className="mt-3 font-mono text-xs text-slate-300">
                          Initializing 3D Lunar South-Pole Terrain Engine...
                        </p>
                      </div>
                    }
                  >
                    <LunarTerrainViewport
                      dataset={dataset}
                      sites={dataset.sites}
                      selectedSiteId={selectedSite.id}
                      onSelectSite={handleSelectSite}
                      hazardLayers={hazardLayers}
                      analysisRevealed={analysisRevealed}
                      isAnalyzing={isAnalyzing}
                      scanProgress={scanProgress}
                      solarEarthState={solarEarthState}
                      performanceMode={performanceMode}
                      idleOrbit={idleOrbit}
                      cameraFocusNonce={cameraFocusNonce}
                    />
                  </Suspense>
                </ViewportErrorBoundary>

                {/* Non-intrusive Corner HUD: Sector Coordinates & Analysis Scan Readout */}
                <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5">
                  <div className="rounded-lg border border-slate-800/90 bg-[#070b15]/88 px-3 py-1.5 font-mono text-[11px] text-slate-300">
                    <span>SOUTH POLE SECTOR </span>
                    <span className="text-[#4be0ff]">
                      {selectedSite.lat.toFixed(2)}°S {selectedSite.lon.toFixed(1)}°E
                    </span>
                    <span className="mx-1.5 text-slate-600">·</span>
                    <span className="text-slate-400">{dataset.sourceType.toUpperCase()}</span>
                  </div>

                  {isAnalyzing && (
                    <div className="flex items-center gap-2 rounded-lg border border-[#4be0ff]/45 bg-[#071122]/95 px-3 py-1.5 font-mono text-[11px] text-[#4be0ff]">
                      <ScanLine className="h-3.5 w-3.5" />
                      <span>{scanStageText}</span>
                      <span className="ml-1 text-white">{Math.round(scanProgress * 100)}%</span>
                    </div>
                  )}
                </div>

                {/* Minimal Viewport Navigation Hint */}
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-800/80 bg-[#070b15]/85 px-2.5 py-1 font-mono text-[10px] text-slate-400">
                  Drag to orbit · Scroll to zoom · Right-drag to pan · Click marker to inspect
                </div>
              </div>

              {/* Sun & Earth Horizon Theater */}
              <SunEarthTheater
                site={selectedSite}
                missionDate={missionDate}
                onChangeDate={setMissionDate}
                cycleProgress={cycleProgress}
                onChangeCycleProgress={(val) => {
                  setIsPlayingCycle(false);
                  setCycleProgress(val);
                }}
                isPlaying={isPlayingCycle}
                onTogglePlay={() => setIsPlayingCycle((p) => !p)}
                solarEarthState={solarEarthState}
              />
            </div>

            {/* Right Column: Detailed Site Analysis & Gemini AI Briefing */}
            <div className="lg:col-span-3 xl:col-span-3">
              <SiteAnalysisPanel
                site={selectedSite}
                solarEarthState={solarEarthState}
                analysisKey={analysisKey}
                isAnalyzing={isAnalyzing}
                briefing={activeBriefing}
                briefingLoading={briefingLoading}
                briefingError={briefingError}
                onRefreshBriefing={() => fetchGeminiBriefing(true)}
                onFocusCamera={() => setCameraFocusNonce((n) => n + 1)}
                onExportBrief={() =>
                  exportMissionBriefFile({
                    site: selectedSite,
                    missionDate,
                    solarEarthState,
                    briefing: activeBriefing,
                    dataset,
                  })
                }
              />
            </div>
          </main>
        </motion.div>
      )}

      {/* Comparison Mode Modal */}
      <ComparisonModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        sites={dataset.sites}
        dataset={dataset}
        missionDate={missionDate}
        initialSiteAId={selectedSite.id}
        onSelectSiteInViewport={handleSelectSite}
      />

      {/* Data Transparency & Custom Lunar Upload Modal */}
      <DataTransparencyModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        dataset={dataset}
        onDatasetReplace={handleDatasetReplace}
        onApplySurfaceTexture={handleApplySurfaceTexture}
        onResetSynthetic={handleResetSynthetic}
      />
    </div>
  );
}
