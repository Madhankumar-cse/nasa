import {
  CraterFeature,
  LandingSite,
  RiskLevel,
  RockInstance,
  TerrainDataset,
} from '@/src/types/mission';

// Deterministic PRNG for repeatable lunar geology
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.48;
  }
  return value;
}

export const DEFAULT_CRATERS: CraterFeature[] = [
  { id: 'c1', name: 'Shackleton Basin', x: -13.5, z: -8.5, radius: 13.5, depth: 5.8, rimHeight: 1.95 },
  { id: 'c2', name: 'Haworth Depression', x: 18.0, z: -15.0, radius: 9.2, depth: 4.1, rimHeight: 1.3 },
  { id: 'c3', name: 'de Gerlache Pit', x: -19.5, z: 16.5, radius: 7.4, depth: 3.3, rimHeight: 1.05 },
  { id: 'c4', name: 'Nobile Minor', x: 15.5, z: 15.5, radius: 6.2, depth: 2.5, rimHeight: 0.85 },
  { id: 'c5', name: 'Shoemaker Rimlet', x: 2.5, z: -21.0, radius: 5.0, depth: 2.1, rimHeight: 0.72 },
  { id: 'c6', name: 'Malapert Hollow', x: -3.5, z: 22.0, radius: 4.6, depth: 1.85, rimHeight: 0.65 },
  { id: 'c7', name: 'Faustini Pocket', x: 24.5, z: 2.0, radius: 4.1, depth: 1.65, rimHeight: 0.55 },
  { id: 'c8', name: 'Sverdrup Micro', x: -24.5, z: -2.0, radius: 3.8, depth: 1.5, rimHeight: 0.5 },
];

interface SiteAnchor {
  id: string;
  number: string;
  name: string;
  region: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
  ellipseRadiusWorld: number;
  summary: string;
}

const SITE_ANCHORS: SiteAnchor[] = [
  {
    id: 'LS-01',
    number: '01',
    name: 'Connecting Ridge Alpha',
    region: 'Shackleton-de Gerlache Ridge',
    x: 2.2,
    z: 3.8,
    lat: 89.46,
    lon: 141.2,
    ellipseRadiusWorld: 3.1,
    summary:
      'Elevated sunlit highland plateau with gentle micro-topography, uninterrupted Earth line-of-sight, and high seasonal illumination.',
  },
  {
    id: 'LS-02',
    number: '02',
    name: 'Malapert Massif Terrace',
    region: 'Malapert North Shelf',
    x: -5.2,
    z: 10.6,
    lat: 88.92,
    lon: 356.8,
    ellipseRadiusWorld: 2.8,
    summary:
      'Broad terraced shelf overlooking southern ejecta aprons; strong DTE visibility with moderate boulder scatter along western edge.',
  },
  {
    id: 'LS-03',
    number: '03',
    name: 'Nobile Rim Plateau',
    region: 'Nobile West Rim',
    x: 11.4,
    z: 6.2,
    lat: 88.64,
    lon: 54.4,
    ellipseRadiusWorld: 2.6,
    summary:
      'Moderate-slope rim apron offering proximity to volatile cold traps while introducing localized boulder fields and ridge shadowing.',
  },
  {
    id: 'LS-04',
    number: '04',
    name: 'Haworth Rim Margin',
    region: 'Haworth South Escarpment',
    x: 11.8,
    z: -10.8,
    lat: 89.18,
    lon: 298.5,
    ellipseRadiusWorld: 2.4,
    summary:
      'Challenging crater-margin bench adjacent to permanently shadowed terrain; steeper grades require precision hazard avoidance.',
  },
  {
    id: 'LS-05',
    number: '05',
    name: 'Shackleton Inner Slope',
    region: 'Shackleton East Wall',
    x: -7.5,
    z: -4.2,
    lat: 89.68,
    lon: 118.4,
    ellipseRadiusWorld: 2.1,
    summary:
      'Steep inner crater wall and deep thermal shadow zone. High tip-over risk, severe boulder concentration, and intermittent DTE lock.',
  },
];

function craterProfile(dist: number, radius: number, depth: number, rimHeight: number): number {
  const r = dist / radius;
  if (r < 0.88) {
    // Parabolic / flat-floored lunar crater bowl
    const t = r / 0.88;
    return -depth * (1 - Math.pow(t, 2.3)) + rimHeight * Math.pow(t, 3.2);
  } else if (r < 1.55) {
    // Raised rim crest decaying outward
    const t = (r - 0.88) / 0.67;
    const crest = Math.cos(t * Math.PI * 0.5);
    return rimHeight * crest * crest;
  }
  return 0;
}

function syntheticElevationAt(x: number, z: number): number {
  // Base sunlit Connecting Ridge running near center-east
  const ridgeDist = Math.abs((x - 1.5) * 0.82 - (z - 2.0) * 0.38);
  const mainRidge = 2.6 * Math.exp(-(ridgeDist * ridgeDist) / 78);

  // Secondary Malapert shelf south-west
  const shelfDist = Math.hypot(x + 6.0, z - 11.5);
  const shelf = 1.65 * Math.exp(-(shelfDist * shelfDist) / 95);

  // Broad highland undulation
  const macroNoise = fbm(x * 0.048 + 4.1, z * 0.048 - 2.3, 4) * 2.1;
  const microRegolith = fbm(x * 0.24 - 7.5, z * 0.24 + 3.2, 3) * 0.26;

  let h = mainRidge + shelf + macroNoise + microRegolith;

  // Apply primary & secondary craters
  for (const c of DEFAULT_CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    h += craterProfile(d, c.radius, c.depth, c.rimHeight);
  }

  // Smooth local landing pads slightly around LS-01 and LS-02 for realistic flat aprons
  const d1 = Math.hypot(x - 2.2, z - 3.8);
  if (d1 < 5.2) {
    const blend = Math.exp(-(d1 * d1) / 14);
    h = h * (1 - blend * 0.55) + 2.45 * (blend * 0.55);
  }
  const d2 = Math.hypot(x + 5.2, z - 10.6);
  if (d2 < 4.5) {
    const blend = Math.exp(-(d2 * d2) / 11);
    h = h * (1 - blend * 0.45) + 1.95 * (blend * 0.45);
  }

  return h;
}

export function sampleHeight(dataset: TerrainDataset, x: number, z: number): number {
  const { gridSize, worldSize, heights } = dataset;
  const half = worldSize / 2;
  const u = Math.max(0, Math.min(1, (x + half) / worldSize)) * (gridSize - 1);
  const v = Math.max(0, Math.min(1, (z + half) / worldSize)) * (gridSize - 1);

  const ix = Math.min(gridSize - 2, Math.floor(u));
  const iz = Math.min(gridSize - 2, Math.floor(v));
  const fx = u - ix;
  const fz = v - iz;

  const h00 = heights[iz * gridSize + ix];
  const h10 = heights[iz * gridSize + ix + 1];
  const h01 = heights[(iz + 1) * gridSize + ix];
  const h11 = heights[(iz + 1) * gridSize + ix + 1];

  const hx0 = h00 + (h10 - h00) * fx;
  const hx1 = h01 + (h11 - h01) * fx;
  return hx0 + (hx1 - hx0) * fz;
}

export function sampleSlope(dataset: TerrainDataset, x: number, z: number): number {
  const { gridSize, worldSize, slopes } = dataset;
  const half = worldSize / 2;
  const ix = Math.max(0, Math.min(gridSize - 1, Math.round(((x + half) / worldSize) * (gridSize - 1))));
  const iz = Math.max(0, Math.min(gridSize - 1, Math.round(((z + half) / worldSize) * (gridSize - 1))));
  return slopes[iz * gridSize + ix];
}

function buildDatasetFromHeights(
  gridSize: number,
  worldSize: number,
  heights: Float32Array,
  craters: CraterFeature[],
  sourceType: 'synthetic' | 'heightmap' | 'csv',
  sourceName: string,
  customAlbedoUrl?: string
): TerrainDataset {
  const cellSize = worldSize / (gridSize - 1);
  const slopes = new Float32Array(gridSize * gridSize);
  const roughness = new Float32Array(gridSize * gridSize);
  const hazardClasses = new Uint8Array(gridSize * gridSize);

  // Compute slope (degrees) and RMS local roughness (meters equivalent)
  for (let iz = 0; iz < gridSize; iz++) {
    for (let ix = 0; ix < gridSize; ix++) {
      const idx = iz * gridSize + ix;
      const xL = heights[iz * gridSize + Math.max(0, ix - 1)];
      const xR = heights[iz * gridSize + Math.min(gridSize - 1, ix + 1)];
      const zU = heights[Math.max(0, iz - 1) * gridSize + ix];
      const zD = heights[Math.min(gridSize - 1, iz + 1) * gridSize + ix];

      const dx = (xR - xL) / (2 * cellSize);
      const dz = (zD - zU) / (2 * cellSize);
      const grad = Math.sqrt(dx * dx + dz * dz);
      const slopeDeg = (Math.atan(grad) * 180) / Math.PI;
      slopes[idx] = slopeDeg;

      // Local 3x3 elevation variance for roughness
      let mean = 0;
      let count = 0;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = Math.max(0, Math.min(gridSize - 1, ix + ox));
          const nz = Math.max(0, Math.min(gridSize - 1, iz + oz));
          mean += heights[nz * gridSize + nx];
          count++;
        }
      }
      mean /= count;
      let variance = 0;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = Math.max(0, Math.min(gridSize - 1, ix + ox));
          const nz = Math.max(0, Math.min(gridSize - 1, iz + oz));
          const diff = heights[nz * gridSize + nx] - mean;
          variance += diff * diff;
        }
      }
      // Scale world units to realistic meter-scale RMS roughness
      const rms = Math.sqrt(variance / count) * 1.45;
      roughness[idx] = rms;

      // Hazard classification:
      // Safe: slope < 8.5 deg and roughness < 0.28 and elevation > -1.2
      // High Risk: slope >= 15.5 deg or roughness >= 0.48 or elevation <= -2.1
      const h = heights[idx];
      if (slopeDeg >= 15.5 || rms >= 0.48 || h <= -2.1) {
        hazardClasses[idx] = 2;
      } else if (slopeDeg >= 8.5 || rms >= 0.28 || h <= -0.9) {
        hazardClasses[idx] = 1;
      } else {
        hazardClasses[idx] = 0;
      }
    }
  }

  // Generate deterministic boulders concentrated around crater ejecta and rough zones
  const rand = mulberry32(20261113);
  const rocks: RockInstance[] = [];
  const targetRocks = 260;
  let attempts = 0;
  const half = worldSize / 2;

  while (rocks.length < targetRocks && attempts < 2200) {
    attempts++;
    const rx = (rand() - 0.5) * (worldSize - 6);
    const rz = (rand() - 0.5) * (worldSize - 6);
    const ix = Math.max(0, Math.min(gridSize - 1, Math.round(((rx + half) / worldSize) * (gridSize - 1))));
    const iz = Math.max(0, Math.min(gridSize - 1, Math.round(((rz + half) / worldSize) * (gridSize - 1))));
    const idx = iz * gridSize + ix;
    const slope = slopes[idx];
    const rough = roughness[idx];

    // Keep LS-01 center pad relatively clean of large boulders
    const distLS01 = Math.hypot(rx - 2.2, rz - 3.8);
    if (distLS01 < 3.4 && rand() > 0.08) continue;

    // Higher probability on rough terrain & crater rims
    const prob = 0.14 + Math.min(0.65, slope / 25 + rough * 0.8);
    if (rand() > prob) continue;

    const u = Math.max(0, Math.min(1, (rx + half) / worldSize)) * (gridSize - 1);
    const v = Math.max(0, Math.min(1, (rz + half) / worldSize)) * (gridSize - 1);
    const gx = Math.min(gridSize - 2, Math.floor(u));
    const gz = Math.min(gridSize - 2, Math.floor(v));
    const fx = u - gx;
    const fz = v - gz;
    const y =
      heights[gz * gridSize + gx] * (1 - fx) * (1 - fz) +
      heights[gz * gridSize + gx + 1] * fx * (1 - fz) +
      heights[(gz + 1) * gridSize + gx] * (1 - fx) * fz +
      heights[(gz + 1) * gridSize + gx + 1] * fx * fz;

    const scale = 0.16 + Math.pow(rand(), 2.1) * 0.68;
    const isHazard = scale > 0.5 || slope > 15;

    rocks.push({
      x: rx,
      y,
      z: rz,
      scale,
      rotY: rand() * Math.PI * 2,
      rotX: (rand() - 0.5) * 0.4,
      isHazard,
    });
  }

  // Evaluate candidate landing sites directly from the computed terrain grid
  const sites: LandingSite[] = SITE_ANCHORS.map((anchor) => {
    // Sample 3x3 neighborhood around site
    let sumH = 0;
    let sumSlope = 0;
    let sumRough = 0;
    let shadowSamples = 0;
    let n = 0;

    for (let dz = -2.2; dz <= 2.2; dz += 1.1) {
      for (let dx = -2.2; dx <= 2.2; dx += 1.1) {
        const sx = anchor.x + dx;
        const sz = anchor.z + dz;
        const ix = Math.max(0, Math.min(gridSize - 1, Math.round(((sx + half) / worldSize) * (gridSize - 1))));
        const iz = Math.max(0, Math.min(gridSize - 1, Math.round(((sz + half) / worldSize) * (gridSize - 1))));
        const idx = iz * gridSize + ix;
        const h = heights[idx];
        sumH += h;
        sumSlope += slopes[idx];
        sumRough += roughness[idx];
        if (h < -0.5 || slopes[idx] > 14) shadowSamples++;
        n++;
      }
    }

    const avgH = sumH / n;
    const avgSlope = sumSlope / n;
    const avgRough = sumRough / n;

    // Count rocks within ellipse radius
    let nearbyRocks = 0;
    for (const r of rocks) {
      if (Math.hypot(r.x - anchor.x, r.z - anchor.z) <= anchor.ellipseRadiusWorld * 1.4) {
        nearbyRocks++;
      }
    }
    const boulderDensity = Math.min(100, nearbyRocks * 6.2 + avgRough * 42);

    // Distance to nearest major crater rim
    let nearestRim = 9999;
    for (const c of craters) {
      const distRim = Math.abs(Math.hypot(anchor.x - c.x, anchor.z - c.z) - c.radius) * 100; // 1 world unit = 100m
      if (distRim < nearestRim) nearestRim = distRim;
    }

    // Horizon-proxy shadow & solar/comm estimates (refined further by ephemerisEngine)
    const elevationBonus = Math.max(-18, Math.min(22, avgH * 7.5));
    const shadowCoveragePct = Math.max(
      6,
      Math.min(92, (shadowSamples / n) * 55 + Math.max(0, 1.8 - avgH) * 14 + avgSlope * 1.2)
    );
    const solarPowerPct = Math.max(12, Math.min(94, 82 + elevationBonus * 0.7 - avgSlope * 1.35 - shadowCoveragePct * 0.35));
    const commWindowPct = Math.max(18, Math.min(96, 84 + elevationBonus * 0.65 - avgSlope * 1.1));

    // Composite safety score (0 - 100)
    const slopePenalty = Math.min(48, avgSlope * 2.25);
    const roughPenalty = Math.min(22, avgRough * 34);
    const shadowPenalty = Math.min(18, shadowCoveragePct * 0.22);
    const boulderPenalty = Math.min(16, boulderDensity * 0.16);
    const rawScore = 100 - slopePenalty - roughPenalty - shadowPenalty - boulderPenalty + Math.max(0, elevationBonus * 0.25);
    const safetyScore = Math.round(Math.max(14, Math.min(96, rawScore)));

    let riskLevel: RiskLevel = 'safe';
    if (safetyScore < 55 || avgSlope >= 14.5) {
      riskLevel = 'high_risk';
    } else if (safetyScore < 78 || avgSlope >= 8.2) {
      riskLevel = 'caution';
    }

    return {
      id: anchor.id,
      number: anchor.number,
      name: anchor.name,
      region: anchor.region,
      x: anchor.x,
      z: anchor.z,
      y: avgH,
      lat: anchor.lat,
      lon: anchor.lon,
      elevationM: avgH * 185, // scaled meters relative to south-pole datum
      safetyScore,
      riskLevel,
      slopeDeg: Number(avgSlope.toFixed(1)),
      roughnessM: Number(avgRough.toFixed(2)),
      shadowCoveragePct: Number(shadowCoveragePct.toFixed(1)),
      solarPowerPct: Number(solarPowerPct.toFixed(1)),
      commWindowPct: Number(commWindowPct.toFixed(1)),
      boulderDensity: Number(boulderDensity.toFixed(1)),
      craterProximityM: Math.round(nearestRim),
      ellipseRadiusWorld: anchor.ellipseRadiusWorld,
      summary: anchor.summary,
    };
  });

  return {
    gridSize,
    worldSize,
    heights,
    slopes,
    roughness,
    hazardClasses,
    craters,
    rocks,
    sites,
    sourceType,
    sourceName,
    customAlbedoUrl,
  };
}

export function generateSyntheticTerrain(gridSize = 112, worldSize = 80): TerrainDataset {
  const heights = new Float32Array(gridSize * gridSize);
  const half = worldSize / 2;

  for (let iz = 0; iz < gridSize; iz++) {
    const z = -half + (iz / (gridSize - 1)) * worldSize;
    for (let ix = 0; ix < gridSize; ix++) {
      const x = -half + (ix / (gridSize - 1)) * worldSize;
      heights[iz * gridSize + ix] = syntheticElevationAt(x, z);
    }
  }

  return buildDatasetFromHeights(
    gridSize,
    worldSize,
    heights,
    DEFAULT_CRATERS,
    'synthetic',
    'Synthetic South-Pole LOLA-Inspired DEM'
  );
}

export function parseCsvElevationGrid(csvText: string, fileName: string, targetGrid = 112): TerrainDataset {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length < 4) {
    throw new Error('CSV must contain at least a 4x4 numeric elevation matrix.');
  }

  const matrix: number[][] = lines.map((line) =>
    line.split(/[,;\s]+/).map((cell) => {
      const v = Number(cell);
      return Number.isFinite(v) ? v : 0;
    })
  );

  const srcRows = matrix.length;
  const srcCols = Math.max(...matrix.map((r) => r.length));
  if (srcCols < 4) {
    throw new Error('CSV rows must contain at least 4 numeric columns.');
  }

  // Normalize elevation scale to ~ [-5.5, +4.5] world units
  let minV = Infinity;
  let maxV = -Infinity;
  for (const row of matrix) {
    for (const v of row) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  const span = Math.max(1e-4, maxV - minV);

  const heights = new Float32Array(targetGrid * targetGrid);
  for (let iz = 0; iz < targetGrid; iz++) {
    const rF = (iz / (targetGrid - 1)) * (srcRows - 1);
    const r0 = Math.floor(rF);
    const r1 = Math.min(srcRows - 1, r0 + 1);
    const fr = rF - r0;

    for (let ix = 0; ix < targetGrid; ix++) {
      const cF = (ix / (targetGrid - 1)) * (srcCols - 1);
      const c0 = Math.floor(cF);
      const c1 = Math.min(srcCols - 1, c0 + 1);
      const fc = cF - c0;

      const v00 = matrix[r0][Math.min(c0, matrix[r0].length - 1)] ?? minV;
      const v10 = matrix[r0][Math.min(c1, matrix[r0].length - 1)] ?? minV;
      const v01 = matrix[r1][Math.min(c0, matrix[r1].length - 1)] ?? minV;
      const v11 = matrix[r1][Math.min(c1, matrix[r1].length - 1)] ?? minV;

      const vx0 = v00 + (v10 - v00) * fc;
      const vx1 = v01 + (v11 - v01) * fc;
      const val = vx0 + (vx1 - vx0) * fr;
      const norm = (val - minV) / span;
      heights[iz * targetGrid + ix] = norm * 9.0 - 4.8;
    }
  }

  return buildDatasetFromHeights(targetGrid, 80, heights, [], 'csv', fileName);
}

export async function parseHeightmapImage(file: File, targetGrid = 112): Promise<TerrainDataset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read heightmap image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unsupported or corrupted heightmap image.'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetGrid;
  canvas.height = targetGrid;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.drawImage(img, 0, 0, targetGrid, targetGrid);
  const imgData = ctx.getImageData(0, 0, targetGrid, targetGrid).data;

  const heights = new Float32Array(targetGrid * targetGrid);
  for (let i = 0; i < targetGrid * targetGrid; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    heights[i] = lum * 9.5 - 5.0;
  }

  return buildDatasetFromHeights(targetGrid, 80, heights, [], 'heightmap', file.name);
}

export function generateSampleCsvContent(): string {
  const size = 24;
  const rows: string[] = [];
  for (let z = 0; z < size; z++) {
    const cols: string[] = [];
    for (let x = 0; x < size; x++) {
      const wx = -35 + (x / (size - 1)) * 70;
      const wz = -35 + (z / (size - 1)) * 70;
      const h = syntheticElevationAt(wx, wz) * 185;
      cols.push(h.toFixed(1));
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n');
}
