// Deterministic mathematical terrain, highway, stunt ramps, and abyssal trench heightfield

export interface RampDef {
  x: number;
  zStart: number; // south end (entry when driving north along -Z)
  zEnd: number;   // north end (launch lip)
  width: number;
  height: number;
}

// 5 Stunt Ramps along the straight Mirage Highway (driving towards -Z)
export const HIGHWAY_RAMPS: RampDef[] = [
  { x: 0, zStart: 485, zEnd: 460, width: 10, height: 6.5 },
  { x: 0, zStart: 90, zEnd: 65, width: 10, height: 7.0 },
  { x: 0, zStart: -295, zEnd: -320, width: 10, height: 7.5 },
  { x: 0, zStart: -630, zEnd: -660, width: 12, height: 9.0 },
  // Mega Cliff Launch Ramp at the northern terminus of the Highway overlooking the Ocean Trench
  { x: 0, zStart: -820, zEnd: -858, width: 16, height: 14.5 },
];

export const HIGHWAY_HALF_WIDTH = 11; // 22m wide highway
export const HIGHWAY_SHOULDER_WIDTH = 18;
export const HIGHWAY_Z_MIN = -860; // North cliff edge where ocean begins
export const HIGHWAY_Z_MAX = 1150; // South desert start

export function isOnHighway(x: number, z: number): boolean {
  return (
    Math.abs(x) <= HIGHWAY_HALF_WIDTH &&
    z >= HIGHWAY_Z_MIN &&
    z <= HIGHWAY_Z_MAX
  );
}

export function getRampHeightAt(x: number, z: number): number {
  for (let i = 0; i < HIGHWAY_RAMPS.length; i++) {
    const r = HIGHWAY_RAMPS[i];
    if (Math.abs(x - r.x) <= r.width * 0.5 && z <= r.zStart && z >= r.zEnd) {
      // Progress from 0 at zStart to 1 at zEnd
      const t = (r.zStart - z) / (r.zStart - r.zEnd);
      // Smooth curved launch profile
      return Math.pow(t, 1.35) * r.height;
    }
  }
  return 0;
}

export function getBaseTerrainHeight(x: number, z: number): number {
  // 1. North of Z = -860 transitions into the Deep Ocean & Lost Underwater City Trench
  if (z < -860) {
    // Smooth coastal drop-off from +3.5m at z = -860 down to -64m in the Aethelgard basin
    const oceanDist = -860 - z;
    const dropFactor = Math.min(1, oceanDist / 260);
    const smoothDrop = dropFactor * dropFactor * (3 - 2 * dropFactor);

    // Flat sunken plaza floor around the Lost Underwater City (x in [-180, 180], z in [-1800, -1100])
    const cityPlazaDist = Math.hypot(x * 0.7, z + 1500);
    const cityFlatten = Math.max(0, 1 - cityPlazaDist / 380);

    // Abyssal ridges and trench walls outside the city plaza
    const abyssalUndulation =
      (Math.sin(x * 0.018) * Math.cos(z * 0.018) * 8 +
        Math.sin(x * 0.045 + z * 0.03) * 3.5) *
      (1 - cityFlatten * 0.85);

    // Outer trench canyon walls rising on far left/right (|x| > 260)
    const wallRise = Math.max(0, (Math.abs(x) - 240) * 0.22);

    const depth = 3.5 - smoothDrop * 67.5 + abyssalUndulation + wallRise;
    return Math.min(-2.5, depth);
  }

  // 2. Land Zone (z >= -860): Endless Straight Highway down X = 0 + Off-Road Desert Badlands & Mesas
  const roadElevation = 3.5;

  const absX = Math.abs(x);
  if (absX <= HIGHWAY_HALF_WIDTH) {
    return roadElevation;
  }

  // Smooth blend from highway shoulder into off-road desert terrain
  const blendOut = Math.min(1, (absX - HIGHWAY_HALF_WIDTH) / 28);
  const smoothBlend = blendOut * blendOut * (3 - 2 * blendOut);

  // Rolling off-road desert dunes
  const dunes =
    Math.sin(x * 0.014) * Math.cos(z * 0.012) * 7.5 +
    Math.sin(x * 0.032 + z * 0.025) * 3.2 +
    Math.cos(x * 0.007 - z * 0.009) * 11.0;

  // Dramatic Redrock Canyon Mesas further out from the highway (|x| > 95)
  let mesaHeight = 0;
  if (absX > 85) {
    const mesaFactor = Math.min(1, (absX - 85) / 90);
    const steppedMesa =
      Math.sin(x * 0.008 + 1.2) * Math.cos(z * 0.007) * 0.5 + 0.5;
    if (steppedMesa > 0.35) {
      mesaHeight = Math.pow(mesaFactor, 1.4) * 36 * Math.min(1, (steppedMesa - 0.35) * 2.5);
    }
  }

  // Natural perimeter mountain barrier at extreme world edges (|x| > 550 or z > 1100)
  const edgeX = Math.max(0, absX - 550) * 0.18;
  const edgeZ = Math.max(0, z - 1080) * 0.18;

  const rawLandHeight = Math.max(1.2, roadElevation + dunes + mesaHeight + edgeX + edgeZ);
  return roadElevation * (1 - smoothBlend) + rawLandHeight * smoothBlend;
}

export function getSurfaceHeight(x: number, z: number): number {
  const base = getBaseTerrainHeight(x, z);
  const ramp = getRampHeightAt(x, z);
  return base + ramp;
}

export function getZoneNameAt(x: number, y: number, z: number): string {
  if (y < -0.5) {
    if (z < -1180 && Math.abs(x) < 220) {
      return 'Lost Underwater City of Aethelgard';
    }
    return 'Abyssal Ocean Trench';
  }
  if (y > 32) {
    return 'Redrock High Airspace';
  }
  if (z < -860) {
    return 'Northern Abyssal Sea';
  }
  if (Math.abs(x) <= HIGHWAY_SHOULDER_WIDTH) {
    return 'Mirage Straightaway Highway';
  }
  if (Math.abs(x) > 105) {
    return 'Redrock Canyon Mesas';
  }
  return 'Badlands Off-Road Dunes';
}
