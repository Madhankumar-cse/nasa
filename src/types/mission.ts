export type RiskLevel = 'safe' | 'caution' | 'high_risk';

export interface CraterFeature {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  depth: number;
  rimHeight: number;
}

export interface RockInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  rotX: number;
  isHazard: boolean;
}

export interface LandingSite {
  id: string;
  number: string;
  name: string;
  region: string;
  x: number;
  z: number;
  y: number;
  lat: number;
  lon: number;
  elevationM: number;
  safetyScore: number;
  riskLevel: RiskLevel;
  slopeDeg: number;
  roughnessM: number;
  shadowCoveragePct: number;
  solarPowerPct: number;
  commWindowPct: number;
  boulderDensity: number;
  craterProximityM: number;
  ellipseRadiusWorld: number;
  summary: string;
}

export interface TerrainDataset {
  gridSize: number;
  worldSize: number;
  heights: Float32Array;
  slopes: Float32Array;
  roughness: Float32Array;
  hazardClasses: Uint8Array; // 0 = safe, 1 = caution, 2 = high_risk
  craters: CraterFeature[];
  rocks: RockInstance[];
  sites: LandingSite[];
  sourceType: 'synthetic' | 'heightmap' | 'csv';
  sourceName: string;
  customAlbedoUrl?: string;
}

export interface HazardLayersState {
  safeZones: boolean;
  cautionZones: boolean;
  highRiskZones: boolean;
  contourLines: boolean;
  craterRims: boolean;
  boulderMarkers: boolean;
  siteMarkers: boolean;
}

export interface MissionBriefingResponse {
  site_id: string;
  safety_score: number;
  risk_level: RiskLevel;
  primary_hazards: string[];
  recommendation: string;
  power_assessment: string;
  communication_assessment: string;
  confidence: number;
  limitations: string[];
}

export interface HorizonPoint {
  azimuthDeg: number;
  horizonElevationDeg: number;
}

export interface TimelineSample {
  step: number;
  dayOffset: number;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  earthElevationDeg: number;
  sunVisible: boolean;
  earthVisible: boolean;
}

export interface SolarEarthState {
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  earthAzimuthDeg: number;
  earthElevationDeg: number;
  localHorizonAtSunDeg: number;
  localHorizonAtEarthDeg: number;
  isSunVisible: boolean;
  isEarthVisible: boolean;
  solarIrradianceWm2: number;
  linkMarginDb: number;
  solarWindowHours: number;
  commWindowHours: number;
  solarWindowPct: number;
  commWindowPct: number;
  horizonProfile: HorizonPoint[];
  timeline: TimelineSample[];
}
