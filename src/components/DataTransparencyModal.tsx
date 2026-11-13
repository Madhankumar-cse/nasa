import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Info,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import {
  generateSampleCsvContent,
  parseCsvElevationGrid,
  parseHeightmapImage,
} from '@/src/engine/terrainEngine';
import { TerrainDataset } from '@/src/types/mission';

interface DataTransparencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: TerrainDataset;
  onDatasetReplace: (newDataset: TerrainDataset) => void;
  onApplySurfaceTexture: (textureUrl: string) => void;
  onResetSynthetic: () => void;
}

export function DataTransparencyModal({
  isOpen,
  onClose,
  dataset,
  onDatasetReplace,
  onApplySurfaceTexture,
  onResetSynthetic,
}: DataTransparencyModalProps) {
  const [activeTab, setActiveTab] = useState<'provenance' | 'upload'>('provenance');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleHeightmapUpload = async (file: File) => {
    setUploadError(null);
    setUploadStatus('Parsing grayscale heightmap & recalculating slope/hazards...');
    try {
      const ds = await parseHeightmapImage(file);
      onDatasetReplace(ds);
      setUploadStatus(`Loaded heightmap "${file.name}" (${ds.gridSize}×${ds.gridSize} grid).`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to load heightmap.');
      setUploadStatus(null);
    }
  };

  const handleCsvUpload = async (file: File) => {
    setUploadError(null);
    setUploadStatus('Parsing CSV elevation matrix & recalculating terrain metrics...');
    try {
      const text = await file.text();
      const ds = parseCsvElevationGrid(text, file.name);
      onDatasetReplace(ds);
      setUploadStatus(`Loaded CSV DEM "${file.name}" (${ds.gridSize}×${ds.gridSize} resampled).`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse CSV elevation grid.');
      setUploadStatus(null);
    }
  };

  const handleSurfaceTextureUpload = async (file: File) => {
    setUploadError(null);
    const url = URL.createObjectURL(file);
    onApplySurfaceTexture(url);
    setUploadStatus(`Applied lunar surface imagery "${file.name}" to 3D regolith mesh.`);
  };

  const handleDownloadSampleCsv = () => {
    const csv = generateSampleCsvContent();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_south_pole_elevation_grid.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Data Provenance and Lunar Data Upload"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="mc-panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[#4be0ff]" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Data &amp; Assumptions
              </h2>
              <p className="font-mono text-[11px] text-slate-400">
                ACTIVE SOURCE: {dataset.sourceName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-700/80 p-2 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
            aria-label="Close Data & Assumptions modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 bg-[#070b15] px-6 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('provenance')}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'provenance'
                ? 'bg-[#4be0ff]/15 text-[#4be0ff] border border-[#4be0ff]/35'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Data Provenance &amp; Model Assumptions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-[#4be0ff]/15 text-[#4be0ff] border border-[#4be0ff]/35'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Advanced: Upload Lunar Data
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 overflow-y-auto p-6 text-sm text-slate-300">
          {activeTab === 'provenance' ? (
            <>
              <div className="rounded-xl border border-[#ffc857]/30 bg-[#ffc857]/8 p-4">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#ffc857]" />
                  <div>
                    <h3 className="font-display text-sm font-semibold text-white">
                      Synthetic Demonstration Topography Notice
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      The default 3D terrain is <strong>synthetic procedural demonstration data</strong> modeled to replicate lunar south-pole geomorphology (Shackleton-scale crater rims, permanently shadowed basins, connecting sunlit ridges, and ejecta boulder fields). It is designed for mission-planning prototyping and public demonstration, not flight certification.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="mc-panel-subtle rounded-xl p-4">
                  <div className="font-mono text-[10px] tracking-wider text-[#4be0ff]">
                    MISSION-CRITICAL REQUIREMENTS
                  </div>
                  <h4 className="mt-1 font-display text-sm font-semibold text-white">
                    Operational NASA Datasets Needed
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
                    <li>• <strong>LOLA DEMs</strong>: Lunar Reconnaissance Orbiter Laser Altimeter 5 m/pixel polar digital elevation models.</li>
                    <li>• <strong>LROC NAC Imagery</strong>: 0.5–1.5 m/px narrow-angle camera mosaics for sub-meter boulder detection.</li>
                    <li>• <strong>JPL SPICE Ephemeris</strong>: High-precision DE440 planetary &amp; lunar libration kernels.</li>
                  </ul>
                </div>

                <div className="mc-panel-subtle rounded-xl p-4">
                  <div className="font-mono text-[10px] tracking-wider text-[#a78bfa]">
                    HORIZON &amp; ILLUMINATION MODEL
                  </div>
                  <h4 className="mt-1 font-display text-sm font-semibold text-white">
                    Simplified Sun/Earth Horizon Math
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
                    <li>• <strong>Horizon Ray-March</strong>: Evaluates 72 azimuthal terrain horizon angles around each site.</li>
                    <li>• <strong>Solar Cycle</strong>: Models 29.53-day synodic azimuth sweep with ±1.54° seasonal sub-solar tilt.</li>
                    <li>• <strong>Earth Libration</strong>: Approximates ±6.68° draconic latitude libration for DTE line-of-sight.</li>
                  </ul>
                </div>
              </div>

              <div className="mc-panel-subtle rounded-xl p-4">
                <div className="font-mono text-[10px] tracking-wider text-slate-400">
                  LIMITATIONS &amp; VALIDATION BOUNDARIES
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Slope and RMS roughness are computed at the active grid resolution (~71 m/node on the default 8 km × 8 km sector). Sub-grid micro-craters, regolith bearing strength, subsurface volatiles, and spacecraft plume-surface interaction effects are not modeled in this demonstration environment.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Import custom elevation grids or lunar surface imagery to dynamically recompute 3D topography, slopes, hazards, and site scores.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-200 hover:border-[#4be0ff]/50"
                  >
                    <Download className="h-3.5 w-3.5 text-[#4be0ff]" />
                    <span>Sample CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetSynthetic();
                      setUploadError(null);
                      setUploadStatus('Restored default synthetic lunar south-pole dataset.');
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-200 hover:border-[#ffc857]/50"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#ffc857]" />
                    <span>Reset Default</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Heightmap Image Upload */}
                <label className="mc-panel-subtle flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-5 text-center transition-colors hover:border-[#4be0ff]/60">
                  <Upload className="h-6 w-6 text-[#4be0ff]" />
                  <span className="font-display text-xs font-semibold text-white">
                    Heightmap Image
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Grayscale PNG/JPG DEM
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleHeightmapUpload(f);
                    }}
                  />
                </label>

                {/* CSV Elevation Grid Upload */}
                <label className="mc-panel-subtle flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-5 text-center transition-colors hover:border-[#3ff0a5]/60">
                  <FileSpreadsheet className="h-6 w-6 text-[#3ff0a5]" />
                  <span className="font-display text-xs font-semibold text-white">
                    CSV Elevation Grid
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Numeric matrix (.csv)
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCsvUpload(f);
                    }}
                  />
                </label>

                {/* Surface Texture Image Upload */}
                <label className="mc-panel-subtle flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-5 text-center transition-colors hover:border-[#a78bfa]/60">
                  <ImageIcon className="h-6 w-6 text-[#a78bfa]" />
                  <span className="font-display text-xs font-semibold text-white">
                    Lunar Surface Imagery
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Ortho mosaic PNG/JPG
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSurfaceTextureUpload(f);
                    }}
                  />
                </label>
              </div>

              {uploadStatus && (
                <div className="rounded-lg border border-[#3ff0a5]/35 bg-[#3ff0a5]/10 px-3.5 py-2.5 font-mono text-xs text-[#3ff0a5]">
                  {uploadStatus}
                </div>
              )}
              {uploadError && (
                <div className="rounded-lg border border-[#ff5f7a]/35 bg-[#ff5f7a]/10 px-3.5 py-2.5 font-mono text-xs text-[#ff5f7a]">
                  {uploadError}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
