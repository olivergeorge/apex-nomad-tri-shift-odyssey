export enum VehicleMode {
  BIKE = 'BIKE',
  PLANE = 'PLANE',
  SUB = 'SUB',
}

export enum GamePhase {
  TITLE = 'TITLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  VICTORY = 'VICTORY',
}

export enum CameraPreset {
  CHASE = 'CHASE',
  CLOSE = 'CLOSE',
  CINEMATIC = 'CINEMATIC',
  COCKPIT = 'COCKPIT',
}

export enum WeatherType {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  FOG = 'FOG',
  STORM = 'STORM',
}

export type MissionType = 'WAYPOINT' | 'COLLECT' | 'STUNT' | 'TRIATHLON';

export interface WaypointCoord {
  x: number;
  y: number;
  z: number;
  radius: number;
  requiredMode?: VehicleMode;
  label: string;
}

export interface MissionDefinition {
  id: string;
  code: string;
  title: string;
  description: string;
  requiredMode: VehicleMode | 'ANY';
  type: MissionType;
  rewardPoints: number;
  waypoints?: WaypointCoord[];
  targetSpeedKmh?: number;
  targetAirtimeSec?: number;
  targetCollectCount?: number;
  collectZone?: 'HIGHWAY' | 'SKY' | 'ABYSS' | 'ANY';
}

export interface TeleportPoint {
  id: string;
  name: string;
  zone: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  recommendedMode: VehicleMode;
}

export interface CollectibleRing {
  id: number;
  x: number;
  y: number;
  z: number;
  zone: 'HIGHWAY' | 'SKY' | 'ABYSS';
  collected: boolean;
  label: string;
}

export interface TelemetryState {
  speedKmh: number;
  altitudeM: number;
  depthM: number;
  boostFuel: number; // 0 to 100
  boostOverheated: boolean;
  boostCooldownSec: number;
  isBoosting: boolean;
  mode: VehicleMode;
  weather: WeatherType;
  weatherAutoCycle: boolean;
  weatherTimerSec: number;
  tractionMultiplier: number;
  windTurbulence: number;
  zoneName: string;
  isUnderwater: boolean;
  isAirborne: boolean;
  score: number;
  collectedCount: number;
  totalCollectibles: number;
  topSpeedKmh: number;
  airtimeSeconds: number;
  currentJumpAirtime: number;
  headingDeg: number;
  distanceToCityM: number;
  // Mission state
  activeMissionId: string;
  activeMissionIndex: number;
  completedMissionIds: string[];
  missionProgressText: string;
  missionProgressRatio: number; // 0 to 1
  nextWaypointDistanceM: number | null;
  nextWaypointBearingDeg: number | null;
  nextWaypointLabel: string | null;
  notification: string | null;
}

export interface InputState {
  throttle: number; // -1 to 1
  steer: number; // -1 to 1 (left/right)
  pitch: number; // -1 to 1 (nose down / pull up)
  boost: boolean;
  jumpOrAscend: boolean;
  dive: boolean;
}
