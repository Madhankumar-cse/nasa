import { sampleHeight } from '@/src/engine/terrainEngine';
import {
  HorizonPoint,
  LandingSite,
  SolarEarthState,
  TerrainDataset,
  TimelineSample,
} from '@/src/types/mission';

function dayOfYear(dateStr: string): number {
  const parsed = new Date(dateStr + 'T12:00:00Z');
  if (Number.isNaN(parsed.getTime())) return 315;
  const start = Date.UTC(parsed.getUTCFullYear(), 0, 0);
  return Math.floor((parsed.getTime() - start) / 86400000);
}

/**
 * Ray-marches outward from (site.x, site.z) across the TerrainDataset heightfield
 * to compute the true local terrain horizon elevation angle (degrees) across 360° azimuth.
 */
export function computeHorizonProfile(
  dataset: TerrainDataset,
  site: LandingSite,
  steps = 72
): HorizonPoint[] {
  const profile: HorizonPoint[] = [];
  const originY = sampleHeight(dataset, site.x, site.z) + 0.18; // lander mast height offset
  const maxDist = dataset.worldSize * 0.46;
  const half = dataset.worldSize / 2 - 0.5;

  for (let i = 0; i < steps; i++) {
    const azDeg = (i / steps) * 360;
    const rad = (azDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dz = Math.sin(rad);

    let maxAngleDeg = -3.5; // Lunar curvature horizon baseline

    for (let dist = 1.8; dist <= maxDist; dist += 1.4) {
      const sx = site.x + dx * dist;
      const sz = site.z + dz * dist;
      if (Math.abs(sx) > half || Math.abs(sz) > half) break;

      const h = sampleHeight(dataset, sx, sz);
      const angleDeg = (Math.atan2(h - originY, dist) * 180) / Math.PI;
      if (angleDeg > maxAngleDeg) {
        maxAngleDeg = angleDeg;
      }
    }

    profile.push({
      azimuthDeg: azDeg,
      horizonElevationDeg: Number(maxAngleDeg.toFixed(2)),
    });
  }

  return profile;
}

function interpolateHorizonAt(profile: HorizonPoint[], azimuthDeg: number): number {
  const norm = ((azimuthDeg % 360) + 360) % 360;
  const stepDeg = 360 / profile.length;
  const idx0 = Math.floor(norm / stepDeg) % profile.length;
  const idx1 = (idx0 + 1) % profile.length;
  const frac = (norm - idx0 * stepDeg) / stepDeg;
  return profile[idx0].horizonElevationDeg * (1 - frac) + profile[idx1].horizonElevationDeg * frac;
}

/**
 * Simplified Lunar South-Pole Sun & Earth Ephemeris + Horizon Visibility Model.
 * cycleProgress: 0..1 across one 29.53-day lunar synodic day starting on missionDate.
 */
export function computeSolarEarthState(
  dataset: TerrainDataset,
  site: LandingSite,
  missionDate: string,
  cycleProgress: number
): SolarEarthState {
  const doy = dayOfYear(missionDate);
  // Lunar sub-solar latitude varies +-1.54 deg seasonally; south pole summer peaks around Dec-Feb
  const seasonalSolarTilt = 1.54 * Math.cos(((doy - 15) / 365.25) * Math.PI * 2);
  // Latitude offset from 90 deg S adds ~0.5 - 1.4 deg max solar elevation
  const latOffset = Math.max(0.3, 90 - site.lat);

  // Earth libration in latitude oscillates +-6.68 deg over the 27.21-day draconic/anomalistic cycle
  const epochDays = new Date(missionDate + 'T00:00:00Z').getTime() / 86400000;
  const draconicPhase = ((epochDays % 27.2122) / 27.2122) * Math.PI * 2;
  const synodicPhase = ((epochDays % 29.5306) / 29.5306) * Math.PI * 2;

  const horizonProfile = computeHorizonProfile(dataset, site, 72);

  const evalAt = (p: number) => {
    const sunAz = (((p * 360 + (synodicPhase * 180) / Math.PI) % 360) + 360) % 360;
    // South pole Sun arcs low along the horizon (-1.2 to +5.8 deg depending on season & azimuth)
    const sunEl =
      1.65 +
      seasonalSolarTilt +
      latOffset * 1.15 * Math.sin(((sunAz + 45) * Math.PI) / 180) +
      0.85 * Math.cos((p * Math.PI * 2) - 0.6);

    // Earth remains within a tighter azimuthal corridor near the sub-Earth longitude (~0°–45° libration)
    const earthAz =
      (28 + 7.5 * Math.sin(draconicPhase + p * Math.PI * 2) + 360) % 360;
    const earthEl =
      3.1 + 4.4 * Math.sin(draconicPhase + p * Math.PI * 1.85) + latOffset * 0.45;

    const horizonSun = interpolateHorizonAt(horizonProfile, sunAz);
    const horizonEarth = interpolateHorizonAt(horizonProfile, earthAz);

    return {
      sunAz,
      sunEl,
      earthAz,
      earthEl,
      horizonSun,
      horizonEarth,
      sunVisible: sunEl > horizonSun,
      earthVisible: earthEl > horizonEarth,
    };
  };

  // Sample 24 points across the 29.53-day lunar cycle
  const timeline: TimelineSample[] = [];
  let sunVisCount = 0;
  let earthVisCount = 0;
  const totalSamples = 24;

  for (let i = 0; i < totalSamples; i++) {
    const p = i / totalSamples;
    const s = evalAt(p);
    if (s.sunVisible) sunVisCount++;
    if (s.earthVisible) earthVisCount++;
    timeline.push({
      step: i,
      dayOffset: Number((p * 29.53).toFixed(1)),
      sunAzimuthDeg: Number(s.sunAz.toFixed(1)),
      sunElevationDeg: Number(s.sunEl.toFixed(2)),
      earthElevationDeg: Number(s.earthEl.toFixed(2)),
      sunVisible: s.sunVisible,
      earthVisible: s.earthVisible,
    });
  }

  const current = evalAt(cycleProgress);
  const solarWindowPct = Number(((sunVisCount / totalSamples) * 100).toFixed(1));
  const commWindowPct = Number(((earthVisCount / totalSamples) * 100).toFixed(1));
  const lunarDayHours = 708.7;

  // Solar irradiance drops sharply at grazing incidence; peak ~1361 W/m^2 at lunar orbit
  const clearanceSun = Math.max(0, current.sunEl - current.horizonSun);
  const solarIrradianceWm2 = current.sunVisible
    ? Math.round(1361 * Math.min(1, 0.35 + clearanceSun * 0.085))
    : 0;

  // DTE Ka-band link margin proxy (dB)
  const clearanceEarth = current.earthEl - current.horizonEarth;
  const linkMarginDb = current.earthVisible
    ? Number((4.5 + Math.min(11.5, clearanceEarth * 1.15)).toFixed(1))
    : -12.0;

  return {
    sunAzimuthDeg: Number(current.sunAz.toFixed(1)),
    sunElevationDeg: Number(current.sunEl.toFixed(2)),
    earthAzimuthDeg: Number(current.earthAz.toFixed(1)),
    earthElevationDeg: Number(current.earthEl.toFixed(2)),
    localHorizonAtSunDeg: Number(current.horizonSun.toFixed(2)),
    localHorizonAtEarthDeg: Number(current.horizonEarth.toFixed(2)),
    isSunVisible: current.sunVisible,
    isEarthVisible: current.earthVisible,
    solarIrradianceWm2,
    linkMarginDb,
    solarWindowHours: Number(((solarWindowPct / 100) * lunarDayHours).toFixed(1)),
    commWindowHours: Number(((commWindowPct / 100) * lunarDayHours).toFixed(1)),
    solarWindowPct,
    commWindowPct,
    horizonProfile,
    timeline,
  };
}
