import * as THREE from 'three';
import { CollectibleRing, WaypointCoord, WeatherType } from '../types/game';
import { ProceduralTextureSet } from './ProceduralTextures';
import {
  getBaseTerrainHeight,
  getSurfaceHeight,
  HIGHWAY_HALF_WIDTH,
  HIGHWAY_RAMPS,
  HIGHWAY_Z_MAX,
  HIGHWAY_Z_MIN,
} from './terrainMath';

export interface WorldEnvironmentRig {
  worldGroup: THREE.Group;
  collectibleMeshes: Map<number, THREE.Group>;
  waypointBeaconGroup: THREE.Group;
  oceanMesh: THREE.Mesh;
  atlantisCoreCrystal: THREE.Mesh;
  updateWorld: (
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    isBoosting: boolean,
    isUnderwater: boolean,
    speedKmh: number,
    weather: WeatherType,
    activeWaypoint: WaypointCoord | null
  ) => void;
}

// Pre-allocated module-scope scratch objects (zero GC in loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _vec3 = new THREE.Vector3();

export function buildOpenWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  collectibles: CollectibleRing[],
  isSoftwareGl: boolean
): WorldEnvironmentRig {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // =========================================================================
  // 1. CONTINUOUS HEIGHTFIELD TERRAIN (Desert Badlands + Coastal Drop + Abyssal Trench)
  // =========================================================================
  const terrainWidth = 1500;
  const terrainLength = 3200; // Z from -1950 to +1250
  const terrainCenterZ = -350;
  const segX = isSoftwareGl ? 96 : 140;
  const segZ = isSoftwareGl ? 160 : 240;

  const terrainGeo = new THREE.PlaneGeometry(
    terrainWidth,
    terrainLength,
    segX,
    segZ
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i) + terrainCenterZ;
    const vy = getBaseTerrainHeight(vx, vz);
    posAttr.setY(i, vy);
    posAttr.setZ(i, vz);

    // Vertex coloring by elevation and biome
    if (vy < -35) {
      // Deep Lost Underwater City trench floor (deep teal-slate)
      _color.setHex(0x0b2536);
    } else if (vy < -2) {
      // Coastal underwater slope
      _color.setHex(0x134e5e);
    } else if (vy < 5.2 && Math.abs(vx) < 28) {
      // Highway shoulder gravel
      _color.setHex(0x9a6544);
    } else if (vy > 22) {
      // High Redrock Canyon Mesa strata
      _color.setHex(0xa8432b);
    } else {
      // Off-road desert badlands sand
      const variation = (Math.sin(vx * 0.05) * Math.cos(vz * 0.05)) * 0.04;
      _color.setRGB(0.76 + variation, 0.48 + variation, 0.31 + variation);
    }

    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.06,
    bumpMap: textures.sandBumpTexture,
    bumpScale: 0.35,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  worldGroup.add(terrainMesh);

  // =========================================================================
  // 2. THE ENDLESS STRAIGHT HIGHWAY (X = 0, Z = +1150 down to -860)
  // =========================================================================
  const highwayLength = HIGHWAY_Z_MAX - HIGHWAY_Z_MIN;
  const highwayCenterZ = (HIGHWAY_Z_MAX + HIGHWAY_Z_MIN) * 0.5;
  const highwayGeo = new THREE.PlaneGeometry(
    HIGHWAY_HALF_WIDTH * 2,
    highwayLength,
    1,
    40
  );
  highwayGeo.rotateX(-Math.PI / 2);

  const highwayMat = new THREE.MeshStandardMaterial({
    map: textures.highwayTexture,
    roughness: 0.62,
    metalness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const highwayMesh = new THREE.Mesh(highwayGeo, highwayMat);
  highwayMesh.position.set(0, 3.55, highwayCenterZ);
  highwayMesh.receiveShadow = !isSoftwareGl;
  worldGroup.add(highwayMesh);

  // Roadside Reflector Posts along the straight highway (InstancedMesh > 20 items)
  const postCount = 160;
  const postGeo = new THREE.BoxGeometry(0.24, 1.3, 0.24);
  postGeo.translate(0, 0.65, 0);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.5,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
  });
  const postInstanced = new THREE.InstancedMesh(postGeo, postMat, postCount);

  for (let i = 0; i < postCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = HIGHWAY_Z_MIN + 20 + Math.floor(i / 2) * 25;
    const x = side * (HIGHWAY_HALF_WIDTH + 0.9);
    const y = getBaseTerrainHeight(x, z);
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    postInstanced.setMatrixAt(i, _dummy.matrix);
  }
  postInstanced.instanceMatrix.needsUpdate = true;
  postInstanced.computeBoundingSphere();
  worldGroup.add(postInstanced);

  // 5 Composite Highway Stunt Ramps + Glowing Boost Pads
  const rampSteelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.78,
    roughness: 0.32,
  });
  const rampDeckMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.4,
    roughness: 0.65,
  });
  const boostStripMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  HIGHWAY_RAMPS.forEach((ramp) => {
    const rampGroup = new THREE.Group();
    const len = ramp.zStart - ramp.zEnd;

    // Sculpted wedge profile using ExtrudeGeometry
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, ramp.height);
    shape.quadraticCurveTo(len * 0.45, ramp.height * 0.38, 0, 0);

    const wedgeGeo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: ramp.width,
      bevelEnabled: false,
    });
    // Orient so x=0..len maps to zStart..zEnd
    wedgeGeo.rotateY(Math.PI / 2);
    wedgeGeo.translate(-ramp.width * 0.5, 0, 0);

    const wedgeMesh = new THREE.Mesh(wedgeGeo, rampDeckMat);
    wedgeMesh.castShadow = !isSoftwareGl;
    wedgeMesh.receiveShadow = !isSoftwareGl;
    rampGroup.add(wedgeMesh);

    // Side structural steel guardrails
    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, ramp.height + 0.6, len * 0.9),
        rampSteelMat
      );
      rail.position.set(
        side * (ramp.width * 0.5 + 0.18),
        ramp.height * 0.35,
        -len * 0.5
      );
      rampGroup.add(rail);

      // Glowing neon launch strip
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.16, len * 0.85),
        boostStripMat
      );
      strip.position.set(
        side * (ramp.width * 0.5 - 0.35),
        ramp.height * 0.55 + 0.15,
        -len * 0.52
      );
      strip.rotation.x = Math.atan2(ramp.height, len);
      rampGroup.add(strip);
    });

    rampGroup.position.set(ramp.x, 3.52, ramp.zStart);
    worldGroup.add(rampGroup);
  });

  // Highway Overhead Gantry Arches (Composite 5-part structures every 350m)
  const gantryZPositions = [750, 350, -50, -450, -820];
  gantryZPositions.forEach((gz) => {
    const gantry = new THREE.Group();
    const baseY = getBaseTerrainHeight(0, gz);
    gantry.position.set(0, baseY, gz);

    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.6, 13, 10);
    pillarGeo.translate(0, 6.5, 0);

    const leftPillar = new THREE.Mesh(pillarGeo, rampSteelMat);
    leftPillar.position.set(-HIGHWAY_HALF_WIDTH - 1.8, 0, 0);
    leftPillar.castShadow = !isSoftwareGl;
    gantry.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, rampSteelMat);
    rightPillar.position.set(HIGHWAY_HALF_WIDTH + 1.8, 0, 0);
    rightPillar.castShadow = !isSoftwareGl;
    gantry.add(rightPillar);

    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry((HIGHWAY_HALF_WIDTH + 2.2) * 2, 1.1, 0.9),
      rampSteelMat
    );
    crossBeam.position.set(0, 12.6, 0);
    gantry.add(crossBeam);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(11, 2.2, 0.35),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.6,
      })
    );
    signBoard.position.set(0, 12.6, 0.45);
    gantry.add(signBoard);

    const neonTrim = new THREE.Mesh(
      new THREE.BoxGeometry(10.4, 0.18, 0.42),
      new THREE.MeshBasicMaterial({
        color: gz === -820 ? 0x06b6d4 : 0xf59e0b,
      })
    );
    neonTrim.position.set(0, 11.6, 0.45);
    gantry.add(neonTrim);

    worldGroup.add(gantry);
  });

  // =========================================================================
  // 3. OFF-ROAD DESERT ROCKS, CACTI & CANYON ARCHES (InstancedMesh + Groups)
  // =========================================================================
  const rockCount = 180;
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
  // Flatten bottom so pivot at y=0 sits flush
  rockGeo.translate(0, 0.75, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xb45339,
    roughness: 0.88,
    metalness: 0.08,
  });
  const rockInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

  for (let i = 0; i < rockCount; i++) {
    // Deterministic pseudo-random placement outside the highway
    const seed1 = Math.sin(i * 12.9898) * 43758.5453;
    const seed2 = Math.sin(i * 78.233) * 43758.5453;
    const rx = (seed1 - Math.floor(seed1)) * 2 - 1;
    const rz = (seed2 - Math.floor(seed2));

    const side = rx >= 0 ? 1 : -1;
    const x = side * (26 + Math.abs(rx) * 420);
    const z = -800 + rz * 1850;
    const y = getBaseTerrainHeight(x, z);

    const scale = 1.6 + ((i * 7) % 15) * 0.45;
    _dummy.position.set(x, y - 0.2, z);
    _dummy.rotation.set(0, (i * 1.1) % Math.PI, 0);
    _dummy.scale.set(scale * 1.3, scale * 0.85, scale);
    _dummy.updateMatrix();
    rockInstanced.setMatrixAt(i, _dummy.matrix);

    const tint = 0.85 + ((i * 13) % 30) * 0.01;
    _color.setRGB(0.72 * tint, 0.34 * tint, 0.22 * tint);
    rockInstanced.setColorAt(i, _color);
  }
  rockInstanced.instanceMatrix.needsUpdate = true;
  if (rockInstanced.instanceColor) rockInstanced.instanceColor.needsUpdate = true;
  rockInstanced.computeBoundingSphere();
  worldGroup.add(rockInstanced);

  // Multi-Part Saguaro Cacti (Trunk + Arm InstancedMeshes)
  const cactusCount = 120;
  const cactusTrunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 5.2, 8);
  cactusTrunkGeo.translate(0, 2.6, 0);
  const cactusArmGeo = new THREE.CylinderGeometry(0.22, 0.26, 2.4, 8);
  cactusArmGeo.translate(0, 3.2, 0.65);
  cactusArmGeo.rotateX(0.35);

  const cactusMat = new THREE.MeshStandardMaterial({
    color: 0x2e6f40,
    roughness: 0.78,
    metalness: 0.05,
  });

  const cactusTrunkInst = new THREE.InstancedMesh(
    cactusTrunkGeo,
    cactusMat,
    cactusCount
  );
  const cactusArmInst = new THREE.InstancedMesh(
    cactusArmGeo,
    cactusMat,
    cactusCount
  );

  for (let i = 0; i < cactusCount; i++) {
    const s1 = Math.sin((i + 40) * 45.164) * 19283.42;
    const s2 = Math.sin((i + 40) * 93.712) * 31827.19;
    const fx = (s1 - Math.floor(s1)) * 2 - 1;
    const fz = s2 - Math.floor(s2);

    const side = fx >= 0 ? 1 : -1;
    const x = side * (22 + Math.abs(fx) * 260);
    const z = -780 + fz * 1800;
    const y = getBaseTerrainHeight(x, z);

    const sc = 0.85 + (i % 7) * 0.08;
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, i * 0.9, 0);
    _dummy.scale.setScalar(sc);
    _dummy.updateMatrix();
    cactusTrunkInst.setMatrixAt(i, _dummy.matrix);
    cactusArmInst.setMatrixAt(i, _dummy.matrix);

    const gTint = 0.88 + (i % 5) * 0.05;
    _color.setRGB(0.18 * gTint, 0.46 * gTint, 0.24 * gTint);
    cactusTrunkInst.setColorAt(i, _color);
    cactusArmInst.setColorAt(i, _color);
  }
  cactusTrunkInst.instanceMatrix.needsUpdate = true;
  cactusArmInst.instanceMatrix.needsUpdate = true;
  cactusTrunkInst.computeBoundingSphere();
  cactusArmInst.computeBoundingSphere();
  worldGroup.add(cactusTrunkInst);
  worldGroup.add(cactusArmInst);

  // Giant Redrock Canyon Sky Arches (Composite structures for Plane mode slalom)
  const archCoords: [number, number, number][] = [
    [-160, 180, 0.2],
    [-110, -280, -0.15],
    [130, 40, 0.3],
    [165, 420, -0.25],
  ];
  archCoords.forEach(([ax, az, rotY]) => {
    const archGroup = new THREE.Group();
    const baseY = getBaseTerrainHeight(ax, az);
    archGroup.position.set(ax, baseY - 2, az);
    archGroup.rotation.y = rotY;

    const archTorus = new THREE.Mesh(
      new THREE.TorusGeometry(48, 7.5, 10, 24, Math.PI),
      rockMat
    );
    archTorus.scale.set(1, 1.35, 0.65);
    archGroup.add(archTorus);
    worldGroup.add(archGroup);
  });

  // =========================================================================
  // 4. NORTHERN OCEAN SURFACE (Y = 0) & LOST UNDERWATER CITY OF AETHELGARD
  // =========================================================================
  const oceanGeo = new THREE.PlaneGeometry(1500, 1450, 32, 32);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.14,
    metalness: 0.1,
    transmission: isSoftwareGl ? 0 : 0.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.58 : 0.86,
    ior: 1.33,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.set(0, 0, -1480);
  oceanMesh.renderOrder = 5;
  worldGroup.add(oceanMesh);

  // LOST UNDERWATER CITY OF AETHELGARD (Centered at X = 0, Z = -1550, Y = -62m)
  const atlantisGroup = new THREE.Group();
  const cityCenterZ = -1550;
  const cityFloorY = getBaseTerrainHeight(0, cityCenterZ);
  atlantisGroup.position.set(0, cityFloorY, cityCenterZ);
  worldGroup.add(atlantisGroup);

  const atlantisStoneMat = new THREE.MeshStandardMaterial({
    color: 0x164e63,
    roughness: 0.42,
    metalness: 0.35,
  });

  const atlantisGoldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.22,
    metalness: 0.88,
  });

  const biolumCyanMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
  });

  const biolumMagentaMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  // Grand Circular Mosaic Plaza Floor
  const plazaDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(135, 140, 1.2, 36),
    new THREE.MeshStandardMaterial({
      map: textures.atlantisTileTexture,
      roughness: 0.35,
      metalness: 0.4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.25,
    })
  );
  plazaDisc.position.set(0, 0.6, 0);
  atlantisGroup.add(plazaDisc);

  // Stepped Citadel Sanctuary Pyramid Plinth
  for (let tier = 0; tier < 3; tier++) {
    const r = 44 - tier * 10;
    const step = new THREE.Mesh(
      new THREE.CylinderGeometry(r - 2, r, 3.2, 12),
      atlantisStoneMat
    );
    step.position.set(0, 2.2 + tier * 3.2, 0);
    atlantisGroup.add(step);

    // Glowing cyan trim ring around each tier
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r - 1.5, 0.35, 8, 24),
      biolumCyanMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 3.7 + tier * 3.2, 0);
    atlantisGroup.add(ring);
  }

  // 12 Citadel Temple Columns arranged in a circle
  for (let c = 0; c < 12; c++) {
    const angle = (c / 12) * Math.PI * 2;
    const colX = Math.cos(angle) * 22;
    const colZ = Math.sin(angle) * 22;

    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.5, 22, 10),
      atlantisStoneMat
    );
    col.position.set(colX, 21, colZ);
    atlantisGroup.add(col);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.2, 3.8),
      atlantisGoldMat
    );
    cap.position.set(colX, 32.2, colZ);
    atlantisGroup.add(cap);
  }

  // Geodesic Sunken Dome Crown
  const domeCrown = new THREE.Mesh(
    new THREE.SphereGeometry(23, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      metalness: 0.8,
      roughness: 0.2,
      wireframe: true,
    })
  );
  domeCrown.position.set(0, 32.5, 0);
  atlantisGroup.add(domeCrown);

  // Rotating Levitating Atlantean Energy Core Crystal inside the Citadel
  const atlantisCoreCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(5.5, 0),
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.9,
    })
  );
  atlantisCoreCrystal.position.set(0, 20, 0);
  atlantisGroup.add(atlantisCoreCrystal);

  // 24 Bioluminescent Obelisks lining the Sunken Avenue & Outer City Ring (InstancedMesh)
  const obeliskCount = 28;
  const obeliskShaftGeo = new THREE.CylinderGeometry(1.2, 2.1, 28, 6);
  obeliskShaftGeo.translate(0, 14, 0);
  const obeliskCapGeo = new THREE.ConeGeometry(1.8, 4.5, 6);
  obeliskCapGeo.translate(0, 30.2, 0);

  const obeliskShaftInst = new THREE.InstancedMesh(
    obeliskShaftGeo,
    atlantisStoneMat,
    obeliskCount
  );
  const obeliskCapInst = new THREE.InstancedMesh(
    obeliskCapGeo,
    biolumCyanMat,
    obeliskCount
  );

  for (let i = 0; i < obeliskCount; i++) {
    let ox = 0;
    let oz = 0;
    if (i < 12) {
      // Sunken Avenue approach from Z = -1080 to -1380
      const side = i % 2 === 0 ? -1 : 1;
      ox = side * 34;
      oz = -1100 - Math.floor(i / 2) * 55;
    } else {
      // Outer ring around the Lost City Plaza
      const idx = i - 12;
      const ang = (idx / 16) * Math.PI * 2;
      const rad = idx % 2 === 0 ? 85 : 122;
      ox = Math.cos(ang) * rad;
      oz = cityCenterZ + Math.sin(ang) * rad;
    }
    const oy = getBaseTerrainHeight(ox, oz);
    _dummy.position.set(ox, oy, oz);
    _dummy.rotation.set(0, (i * Math.PI) / 6, 0);
    _dummy.scale.setScalar(1 + (i % 3) * 0.15);
    _dummy.updateMatrix();
    obeliskShaftInst.setMatrixAt(i, _dummy.matrix);
    obeliskCapInst.setMatrixAt(i, _dummy.matrix);
  }
  obeliskShaftInst.instanceMatrix.needsUpdate = true;
  obeliskCapInst.instanceMatrix.needsUpdate = true;
  obeliskShaftInst.computeBoundingSphere();
  obeliskCapInst.computeBoundingSphere();
  worldGroup.add(obeliskShaftInst);
  worldGroup.add(obeliskCapInst);

  // 4 Giant Sunken Portal Archways along the Underwater City Boulevard
  const portalZList = [-1150, -1280, -1410, -1710];
  portalZList.forEach((pz) => {
    const portal = new THREE.Group();
    const py = getBaseTerrainHeight(0, pz);
    portal.position.set(0, py, pz);

    const outerArch = new THREE.Mesh(
      new THREE.TorusGeometry(24, 2.4, 10, 28, Math.PI),
      atlantisStoneMat
    );
    portal.add(outerArch);

    const innerGlowArch = new THREE.Mesh(
      new THREE.TorusGeometry(21.2, 0.55, 8, 28, Math.PI),
      biolumMagentaMat
    );
    portal.add(innerGlowArch);
    worldGroup.add(portal);
  });

  // =========================================================================
  // 5. 30 COLLECTIBLE ENERGY RINGS & RELICS
  // =========================================================================
  const collectibleMeshes = new Map<number, THREE.Group>();
  const ringTorusGeo = new THREE.TorusGeometry(3.2, 0.32, 10, 24);
  const relicCoreGeo = new THREE.OctahedronGeometry(1.35, 0);

  const ringMatByZone = {
    HIGHWAY: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    SKY: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    ABYSS: new THREE.MeshBasicMaterial({ color: 0x2dd4bf }),
  };

  collectibles.forEach((item) => {
    const g = new THREE.Group();
    g.position.set(item.x, item.y, item.z);

    const ringMesh = new THREE.Mesh(ringTorusGeo, ringMatByZone[item.zone]);
    g.add(ringMesh);

    const coreMesh = new THREE.Mesh(
      relicCoreGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    g.add(coreMesh);

    worldGroup.add(g);
    collectibleMeshes.set(item.id, g);
  });

  // =========================================================================
  // 6. ACTIVE 3D MISSION WAYPOINT BEACON (Sky/Sea Light Pillar + Target Gate)
  // =========================================================================
  const waypointBeaconGroup = new THREE.Group();
  worldGroup.add(waypointBeaconGroup);

  const beaconRingMesh = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.65, 12, 32),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
    })
  );
  waypointBeaconGroup.add(beaconRingMesh);

  const beaconPillarGeo = new THREE.CylinderGeometry(2.2, 2.2, 220, 16, 1, true);
  beaconPillarGeo.translate(0, 110, 0);
  const beaconPillarMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beaconPillarMesh = new THREE.Mesh(beaconPillarGeo, beaconPillarMat);
  waypointBeaconGroup.add(beaconPillarMesh);

  // =========================================================================
  // 7. POOLED 3D PARTICLE SYSTEM (Boost Plasma / Tire Dust / Sub Bubbles)
  //    + DYNAMIC WEATHER RAIN / STORM STREAKS
  // =========================================================================
  const trailPoolSize = 48;
  const trailGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
  });
  const trailInst = new THREE.InstancedMesh(trailGeo, trailMat, trailPoolSize);
  trailInst.frustumCulled = false;
  worldGroup.add(trailInst);

  const trailParticles = Array.from({ length: trailPoolSize }, () => ({
    active: false,
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 0.6,
    scale: 1,
  }));
  let trailCursor = 0;
  let spawnAccum = 0;

  // Weather Rain / Storm Particle System (InstancedMesh following player)
  const rainCount = isSoftwareGl ? 180 : 420;
  const rainGeo = new THREE.BoxGeometry(0.06, 2.6, 0.06);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const rainInst = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainInst.frustumCulled = false;
  worldGroup.add(rainInst);

  const rainOffsets = Array.from({ length: rainCount }, () => ({
    dx: (Math.random() - 0.5) * 90,
    dy: Math.random() * 45,
    dz: (Math.random() - 0.5) * 90,
    speed: 34 + Math.random() * 14,
  }));

  return {
    worldGroup,
    collectibleMeshes,
    waypointBeaconGroup,
    oceanMesh,
    atlantisCoreCrystal,
    updateWorld(
      dt,
      elapsed,
      playerPos,
      isBoosting,
      isUnderwater,
      speedKmh,
      weather,
      activeWaypoint
    ) {
      // 1. Rotate Atlantean Citadel Crystal & pulse collectibles
      atlantisCoreCrystal.rotation.y = elapsed * 0.9;
      atlantisCoreCrystal.position.y = 20 + Math.sin(elapsed * 2.2) * 1.4;

      collectibleMeshes.forEach((group, id) => {
        if (group.visible) {
          group.rotation.y = elapsed * 1.8 + id;
          group.children[1].rotation.x = elapsed * 2.5;
        }
      });

      // 2. Update Active Mission Waypoint Beacon
      if (activeWaypoint) {
        waypointBeaconGroup.visible = true;
        waypointBeaconGroup.position.set(
          activeWaypoint.x,
          activeWaypoint.y,
          activeWaypoint.z
        );
        beaconRingMesh.rotation.y = elapsed * 1.4;
        const pulseScale = 1 + Math.sin(elapsed * 4.5) * 0.08;
        beaconRingMesh.scale.setScalar(pulseScale);
      } else {
        waypointBeaconGroup.visible = false;
      }

      // 3. Spawn & advance pooled vehicle trail particles (Boost Plasma, Sub Bubbles, or Dust)
      const speedAbs = Math.abs(speedKmh);
      if (speedAbs > 18 || isBoosting) {
        spawnAccum += dt * (isBoosting ? 55 : 22);
        while (spawnAccum >= 1) {
          spawnAccum -= 1;
          const p = trailParticles[trailCursor];
          trailCursor = (trailCursor + 1) % trailPoolSize;
          p.active = true;
          p.x = playerPos.x + (Math.random() - 0.5) * 0.9;
          p.y = playerPos.y + 0.6 + (Math.random() - 0.5) * 0.4;
          p.z = playerPos.z + (Math.random() - 0.5) * 0.9;
          p.vx = (Math.random() - 0.5) * 2.5;
          p.vy = isUnderwater ? 2.8 + Math.random() * 2 : 0.8 + Math.random() * 1.5;
          p.vz = (Math.random() - 0.5) * 2.5;
          p.life = 0;
          p.maxLife = isBoosting ? 0.48 : 0.65;
          p.scale = isBoosting ? 1.5 : 0.9;
        }
      }

      if (isBoosting) {
        trailMat.color.setHex(0xf97316);
      } else if (isUnderwater) {
        trailMat.color.setHex(0x67e8f9);
      } else {
        trailMat.color.setHex(0xd6a374);
      }

      for (let i = 0; i < trailPoolSize; i++) {
        const p = trailParticles[i];
        if (!p.active) {
          _dummy.position.set(0, -9999, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          trailInst.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -9999, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          trailInst.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const lifeRatio = 1 - p.life / p.maxLife;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.scale.setScalar(p.scale * lifeRatio);
        _dummy.updateMatrix();
        trailInst.setMatrixAt(i, _dummy.matrix);
      }
      trailInst.instanceMatrix.needsUpdate = true;

      // 4. Dynamic Weather Rain / Storm Particles
      const isRaining =
        !isUnderwater &&
        (weather === WeatherType.RAIN || weather === WeatherType.STORM);
      const targetRainOpacity = isRaining
        ? weather === WeatherType.STORM
          ? 0.62
          : 0.42
        : 0;
      rainMat.opacity = THREE.MathUtils.damp(
        rainMat.opacity,
        targetRainOpacity,
        4,
        dt
      );

      if (rainMat.opacity > 0.02) {
        rainInst.visible = true;
        const windTilt = weather === WeatherType.STORM ? 0.28 : 0.08;
        for (let i = 0; i < rainCount; i++) {
          const r = rainOffsets[i];
          r.dy -= r.speed * dt;
          if (r.dy < -8) {
            r.dy = 38;
          }
          _vec3.set(
            playerPos.x + r.dx,
            playerPos.y + r.dy,
            playerPos.z + r.dz
          );
          _dummy.position.copy(_vec3);
          _dummy.rotation.set(0, 0, windTilt);
          _dummy.scale.setScalar(1);
          _dummy.updateMatrix();
          rainInst.setMatrixAt(i, _dummy.matrix);
        }
        rainInst.instanceMatrix.needsUpdate = true;
      } else {
        rainInst.visible = false;
      }

      // 5. Wet Road Reflections during Rain / Storm
      const targetRoadRoughness =
        weather === WeatherType.RAIN || weather === WeatherType.STORM
          ? 0.22
          : 0.62;
      highwayMat.roughness = THREE.MathUtils.damp(
        highwayMat.roughness,
        targetRoadRoughness,
        3,
        dt
      );
    },
  };
}
