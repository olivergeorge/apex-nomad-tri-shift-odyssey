import {
  CollectibleRing,
  MissionDefinition,
  TeleportPoint,
  VehicleMode,
} from '../types/game';

export const TELEPORT_POINTS: TeleportPoint[] = [
  {
    id: 'highway_south',
    name: 'Mirage Highway Start',
    zone: 'Endless Desert Highway',
    x: 0,
    y: 4.5,
    z: 950,
    heading: 0,
    recommendedMode: VehicleMode.BIKE,
  },
  {
    id: 'canyon_ramp',
    name: 'North Cliff Mega-Ramp',
    zone: 'Coastal Canyon Overlook',
    x: 0,
    y: 4.5,
    z: -480,
    heading: 0,
    recommendedMode: VehicleMode.BIKE,
  },
  {
    id: 'sky_arch',
    name: 'Redrock Sky Arch',
    zone: 'High Altitude Badlands',
    x: -160,
    y: 95,
    z: 180,
    heading: -0.35,
    recommendedMode: VehicleMode.PLANE,
  },
  {
    id: 'abyss_gate',
    name: 'Sunken City Gate',
    zone: 'Aethelgard Trench (-55m)',
    x: 0,
    y: -48,
    z: -1150,
    heading: 0,
    recommendedMode: VehicleMode.SUB,
  },
  {
    id: 'atlantis_core',
    name: 'Abyssal Citadel Core',
    zone: 'Lost City of Aethelgard (-62m)',
    x: 0,
    y: -52,
    z: -1520,
    heading: 0,
    recommendedMode: VehicleMode.SUB,
  },
];

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'op_highway_blitz',
    code: 'OP-01',
    title: 'Mirage Highway Rocket Blitz',
    description:
      'Blast down the long straight highway in Motorbike mode, pass 3 Highway Checkpoints, and exceed 230 km/h using Rocket Boosters.',
    requiredMode: VehicleMode.BIKE,
    type: 'WAYPOINT',
    rewardPoints: 1000,
    targetSpeedKmh: 230,
    waypoints: [
      {
        x: 0,
        y: 4.5,
        z: 650,
        radius: 26,
        requiredMode: VehicleMode.BIKE,
        label: 'South Highway Gate',
      },
      {
        x: 0,
        y: 4.5,
        z: 250,
        radius: 26,
        requiredMode: VehicleMode.BIKE,
        label: 'Mid-Desert Speed Trap',
      },
      {
        x: 0,
        y: 4.5,
        z: -150,
        radius: 26,
        requiredMode: VehicleMode.BIKE,
        label: 'North Highway Terminus',
      },
    ],
  },
  {
    id: 'op_sky_stunt',
    code: 'OP-02',
    title: 'Mega-Ramp Aero Ignition',
    description:
      'Hit a Highway Stunt Ramp with Rocket Boosters, accumulate 3.5s of airtime, and transform into Plane mode mid-air to reach the Sky Beacon.',
    requiredMode: 'ANY',
    type: 'STUNT',
    rewardPoints: 1500,
    targetAirtimeSec: 3.5,
    waypoints: [
      {
        x: 0,
        y: 58,
        z: -620,
        radius: 42,
        requiredMode: VehicleMode.PLANE,
        label: 'High-Altitude Aero Beacon',
      },
    ],
  },
  {
    id: 'op_canyon_wings',
    code: 'OP-03',
    title: 'Redrock Canyon Wing Slalom',
    description:
      'Engage Plane mode and pilot through 4 aerial waypoints weaving across the desert mesas and coastal cliffs.',
    requiredMode: VehicleMode.PLANE,
    type: 'WAYPOINT',
    rewardPoints: 1800,
    waypoints: [
      {
        x: -110,
        y: 68,
        z: -280,
        radius: 38,
        requiredMode: VehicleMode.PLANE,
        label: 'West Mesa Airspace',
      },
      {
        x: -160,
        y: 82,
        z: 120,
        radius: 38,
        requiredMode: VehicleMode.PLANE,
        label: 'Redrock Archway',
      },
      {
        x: 130,
        y: 75,
        z: 40,
        radius: 38,
        requiredMode: VehicleMode.PLANE,
        label: 'East Badlands Ridge',
      },
      {
        x: 0,
        y: 52,
        z: -780,
        radius: 42,
        requiredMode: VehicleMode.PLANE,
        label: 'Ocean Trench Approach',
      },
    ],
  },
  {
    id: 'op_sub_descent',
    code: 'OP-04',
    title: 'Descent to Lost Aethelgard',
    description:
      'Dive into the northern ocean, transform into Submarine mode, and navigate through the sunken colonnade into the Lost Underwater City.',
    requiredMode: VehicleMode.SUB,
    type: 'WAYPOINT',
    rewardPoints: 2000,
    waypoints: [
      {
        x: 0,
        y: -24,
        z: -1020,
        radius: 34,
        requiredMode: VehicleMode.SUB,
        label: 'Trench Drop-Off (-24m)',
      },
      {
        x: 0,
        y: -50,
        z: -1260,
        radius: 34,
        requiredMode: VehicleMode.SUB,
        label: 'Sunken Avenue Portal (-50m)',
      },
      {
        x: 0,
        y: -56,
        z: -1550,
        radius: 38,
        requiredMode: VehicleMode.SUB,
        label: 'Aethelgard Citadel Core (-56m)',
      },
    ],
  },
  {
    id: 'op_abyss_relics',
    code: 'OP-05',
    title: 'Relics of the Sunken Citadel',
    description:
      'Explore the Lost Underwater City in Submarine mode and collect 5 glowing Atlantean Energy Relics hidden among the sunken temples.',
    requiredMode: VehicleMode.SUB,
    type: 'COLLECT',
    rewardPoints: 2500,
    targetCollectCount: 5,
    collectZone: 'ABYSS',
  },
  {
    id: 'op_tri_shift_odyssey',
    code: 'OP-06',
    title: 'Tri-Shift Apex Triathlon',
    description:
      'Master all 3 vehicle forms in one continuous run: Highway Gate (Motorbike), Canyon Sky Peak (Plane), and Abyssal Sanctum (Submarine).',
    requiredMode: 'ANY',
    type: 'TRIATHLON',
    rewardPoints: 3500,
    waypoints: [
      {
        x: 0,
        y: 4.5,
        z: -120,
        radius: 28,
        requiredMode: VehicleMode.BIKE,
        label: 'Stage 1: Highway Gate (BIKE)',
      },
      {
        x: 95,
        y: 78,
        z: -680,
        radius: 40,
        requiredMode: VehicleMode.PLANE,
        label: 'Stage 2: Coastal Sky Ring (PLANE)',
      },
      {
        x: 0,
        y: -56,
        z: -1550,
        radius: 40,
        requiredMode: VehicleMode.SUB,
        label: 'Stage 3: Sunken Citadel (SUB)',
      },
    ],
  },
];

export function createInitialCollectibles(): CollectibleRing[] {
  const rings: CollectibleRing[] = [];
  let id = 1;

  // 10 Highway Rings (along the straight highway & stunt ramp apexes)
  const highwayZ = [820, 620, 440, 220, 40, -160, -340, -520, -680, -810];
  for (let i = 0; i < highwayZ.length; i++) {
    const z = highwayZ[i];
    // Put rings elevated after ramps at 440, 40, -340, -680
    const isRampPeak = i % 2 === 1;
    rings.push({
      id: id++,
      x: 0,
      y: isRampPeak ? 18 : 6.2,
      z,
      zone: 'HIGHWAY',
      collected: false,
      label: `Highway Plasma Ring #${i + 1}`,
    });
  }

  // 10 Sky Rings (high above canyons, mesas, and ocean coast)
  const skyCoords: [number, number, number][] = [
    [-120, 58, 520],
    [-160, 82, 180],
    [-110, 74, -220],
    [130, 68, 420],
    [165, 88, 60],
    [125, 72, -320],
    [0, 62, -620],
    [-95, 65, -860],
    [95, 70, -920],
    [0, 85, -1180],
  ];
  for (let i = 0; i < skyCoords.length; i++) {
    const [x, y, z] = skyCoords[i];
    rings.push({
      id: id++,
      x,
      y,
      z,
      zone: 'SKY',
      collected: false,
      label: `Aero Sky Ring #${i + 1}`,
    });
  }

  // 10 Abyssal Relics inside the Lost Underwater City of Aethelgard
  const abyssCoords: [number, number, number][] = [
    [0, -32, -1080],
    [0, -48, -1220],
    [-48, -54, -1340],
    [48, -54, -1340],
    [0, -52, -1420],
    [-75, -56, -1550],
    [75, -56, -1550],
    [0, -55, -1550],
    [-45, -56, -1690],
    [45, -56, -1690],
  ];
  for (let i = 0; i < abyssCoords.length; i++) {
    const [x, y, z] = abyssCoords[i];
    rings.push({
      id: id++,
      x,
      y,
      z,
      zone: 'ABYSS',
      collected: false,
      label: `Aethelgard Sunken Relic #${i + 1}`,
    });
  }

  return rings;
}
