import {
  LandingSite,
  MissionBriefingResponse,
  SolarEarthState,
  TerrainDataset,
} from '@/src/types/mission';

export function exportMissionBriefFile(params: {
  site: LandingSite;
  missionDate: string;
  solarEarthState: SolarEarthState;
  briefing: MissionBriefingResponse | null;
  dataset: TerrainDataset;
}) {
  const { site, missionDate, solarEarthState, briefing, dataset } = params;

  const lines: string[] = [
    `# LUNAR LANDING SITE NAVIGATOR — MISSION BRIEF`,
    `Generated: ${new Date().toISOString()}`,
    `Mission Epoch Date: ${missionDate}`,
    ``,
    `## 1. Selected Candidate Site`,
    `- **Site ID**: ${site.id} (${site.name})`,
    `- **Sector / Region**: ${site.region}`,
    `- **Coordinates**: ${site.lat.toFixed(3)}° S, ${site.lon.toFixed(3)}° E`,
    `- **Elevation (Lunar Datum)**: ${site.elevationM.toFixed(0)} m`,
    `- **Landing Ellipse Radius**: ±${Math.round(site.ellipseRadiusWorld * 100)} m`,
    `- **Composite Safety Score**: ${site.safetyScore} / 100`,
    `- **Risk Classification**: ${site.riskLevel.toUpperCase()}`,
    ``,
    `## 2. Terrain Hazard Breakdown`,
    `- **Mean Surface Slope**: ${site.slopeDeg.toFixed(1)}°`,
    `- **Surface Roughness (RMS)**: ${site.roughnessM.toFixed(2)} m`,
    `- **Shadow / PSR Coverage**: ${site.shadowCoveragePct.toFixed(1)}%`,
    `- **Boulder Hazard Index**: ${site.boulderDensity.toFixed(1)} / 100`,
    `- **Nearest Crater Rim Distance**: ${site.craterProximityM} m`,
    ``,
    `## 3. Sun & Earth Visibility Windows (29.53-day Synodic Cycle)`,
    `- **Solar Power Illumination Window**: ${solarEarthState.solarWindowPct.toFixed(1)}% (${solarEarthState.solarWindowHours.toFixed(1)} hours)`,
    `- **Direct-to-Earth (DTE) Comm Window**: ${solarEarthState.commWindowPct.toFixed(1)}% (${solarEarthState.commWindowHours.toFixed(1)} hours)`,
    `- **Current Epoch Sun Elevation**: ${solarEarthState.sunElevationDeg.toFixed(2)}° (Horizon Mask: ${solarEarthState.localHorizonAtSunDeg.toFixed(2)}°)`,
    `- **Current Epoch Earth Elevation**: ${solarEarthState.earthElevationDeg.toFixed(2)}° (Horizon Mask: ${solarEarthState.localHorizonAtEarthDeg.toFixed(2)}°)`,
    ``,
    `## 4. AI Mission Briefing`,
  ];

  if (briefing) {
    lines.push(
      `- **Recommendation**: ${briefing.recommendation}`,
      `- **Confidence**: ${briefing.confidence}%`,
      `- **Primary Hazards**:`,
      ...briefing.primary_hazards.map((h) => `  - ${h}`),
      `- **Solar Power Assessment**: ${briefing.power_assessment}`,
      `- **Communication Assessment**: ${briefing.communication_assessment}`,
      `- **AI Assessment Limitations**:`,
      ...briefing.limitations.map((l) => `  - ${l}`)
    );
  } else {
    lines.push(
      `- **Terrain Summary**: ${site.summary}`,
      `- *(Live Gemini AI briefing was not generated prior to export; quantitative telemetry above reflects terrain engine outputs.)*`
    );
  }

  lines.push(
    ``,
    `## 5. Data Provenance, Assumptions & Limitations`,
    `- **Active Terrain Source**: ${dataset.sourceName} (${dataset.sourceType})`,
    `- **Grid Resolution**: ${dataset.gridSize} × ${dataset.gridSize} elevation nodes (${dataset.worldSize * 100} m × ${dataset.worldSize * 100} m region)`,
    `- **Demonstration Disclaimer**: Default terrain is synthetic demonstration topography modeled on lunar south-pole geomorphology.`,
    `- **Flight-Critical Requirement**: Operational mission certification requires real NASA LOLA (Lunar Orbiter Laser Altimeter) DEMs, LROC NAC imagery, and JPL SPICE ephemeris kernels.`,
    `- **Horizon Model**: Simplified 72-azimuth local terrain ray-marching combined with analytical lunar libration and sub-solar tilt curves.`
  );

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lunar-mission-brief-${site.id.toLowerCase()}-${missionDate}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
