import * as THREE from 'three';
import { VehicleMode } from '../types/game';

export interface TransformingVehicleRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  contactShadow: THREE.Mesh;
  updateVisuals: (
    dt: number,
    elapsed: number,
    mode: VehicleMode,
    speedKmh: number,
    steer: number,
    pitch: number,
    isBoosting: boolean,
    isUnderwater: boolean,
    groundY: number
  ) => void;
}

export function createTransformingVehicle(
  contactShadowTexture: THREE.CanvasTexture,
  isSoftwareGl: boolean
): TransformingVehicleRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  // Pivot at bottom-center: wheel bottom sits at y = 0 in root space
  chassisGroup.position.set(0, 0, 0);
  root.add(chassisGroup);

  // Materials with varied roughness (>= 0.25 delta) and metalness
  const primaryArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0xea580c, // Blaze Nomad Orange-Red
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });

  const carbonFrameMat = new THREE.MeshStandardMaterial({
    color: 0x181b22,
    metalness: 0.35,
    roughness: 0.68,
  });

  const titaniumAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.18,
  });

  const tireRubberMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    metalness: 0.08,
    roughness: 0.88,
  });

  const wingAirfoilMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    metalness: 0.65,
    roughness: 0.25,
    clearcoat: 0.6,
  });

  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.05,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.86,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 0.95,
    ior: 1.52,
    thickness: 0.4,
    depthWrite: false,
  });

  const plasmaGlowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });

  const flameInnerMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  // 1. Primary Sculpted Chassis Hull (ExtrudeGeometry with bevels)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.35, 0.52);
  hullShape.lineTo(-0.65, 1.08);
  hullShape.lineTo(0.45, 1.15);
  hullShape.lineTo(1.25, 0.72);
  hullShape.lineTo(1.05, 0.44);
  hullShape.lineTo(-0.95, 0.42);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    steps: 1,
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 3,
  });
  hullGeo.center();
  // Rotate so length is along Z (-Z is forward)
  hullGeo.rotateY(Math.PI / 2);
  const mainHull = new THREE.Mesh(hullGeo, primaryArmorMat);
  mainHull.position.set(0, 0.86, 0);
  mainHull.castShadow = !isSoftwareGl;
  mainHull.receiveShadow = !isSoftwareGl;
  chassisGroup.add(mainHull);

  // 2. Lower Engine Crankcase & Skidplate (Carbon + Titanium)
  const engineBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.38, 0.95),
    carbonFrameMat
  );
  engineBlock.position.set(0, 0.56, 0.05);
  engineBlock.castShadow = !isSoftwareGl;
  chassisGroup.add(engineBlock);

  // 3. Front Steering Fork, Handlebars & Headlight Assembly
  const steeringAssembly = new THREE.Group();
  steeringAssembly.position.set(0, 0.92, -0.92);
  chassisGroup.add(steeringAssembly);

  const forkTubeGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.88, 12);
  const leftFork = new THREE.Mesh(forkTubeGeo, titaniumAlloyMat);
  leftFork.position.set(-0.16, -0.18, -0.14);
  leftFork.rotation.x = 0.34;
  steeringAssembly.add(leftFork);

  const rightFork = new THREE.Mesh(forkTubeGeo, titaniumAlloyMat);
  rightFork.position.set(0.16, -0.18, -0.14);
  rightFork.rotation.x = 0.34;
  steeringAssembly.add(rightFork);

  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.86, 10),
    carbonFrameMat
  );
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.26, 0.05);
  steeringAssembly.add(handlebar);

  // Front Nose Cowl & LED Headlight
  const noseCowl = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.55, 6),
    primaryArmorMat
  );
  noseCowl.rotation.x = -Math.PI / 2;
  noseCowl.position.set(0, 0.1, -0.22);
  steeringAssembly.add(noseCowl);

  const headlightMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.1, 0.08),
    plasmaGlowMat
  );
  headlightMesh.position.set(0, 0.12, -0.44);
  steeringAssembly.add(headlightMesh);

  // Subsea Sonar Spotlight Cone (visible underwater or in dense fog)
  const beamGeo = new THREE.ConeGeometry(3.2, 16, 16, 1, true);
  beamGeo.translate(0, -8, 0);
  beamGeo.rotateX(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sonarBeamCone = new THREE.Mesh(beamGeo, beamMat);
  sonarBeamCone.position.set(0, 0.1, -0.5);
  steeringAssembly.add(sonarBeamCone);

  // 4 & 5. Composite Front & Rear Wheels (Tire + Anodized Rim + Brake Disc + Thruster Core)
  function buildWheelAssembly(): {
    pivot: THREE.Group;
    spinGroup: THREE.Group;
    thrusterGlow: THREE.Mesh;
  } {
    const pivot = new THREE.Group();
    const spinGroup = new THREE.Group();
    pivot.add(spinGroup);

    const tireGeo = new THREE.TorusGeometry(0.36, 0.13, 14, 24);
    tireGeo.rotateY(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireRubberMat);
    tire.castShadow = !isSoftwareGl;
    spinGroup.add(tire);

    const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.14, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, titaniumAlloyMat);
    spinGroup.add(rim);

    // Spokes
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.46, 0.045),
        carbonFrameMat
      );
      spoke.rotation.x = (i * Math.PI) / 6;
      spinGroup.add(spoke);
    }

    // Center hover/hydro glow ring (lights up when wheels pivot in Plane/Sub mode)
    const glowGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.17, 16);
    glowGeo.rotateZ(Math.PI / 2);
    const thrusterGlow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    thrusterGlow.visible = false;
    spinGroup.add(thrusterGlow);

    return { pivot, spinGroup, thrusterGlow };
  }

  const frontWheel = buildWheelAssembly();
  frontWheel.pivot.position.set(0, 0.49, -1.16);
  chassisGroup.add(frontWheel.pivot);

  const rearWheel = buildWheelAssembly();
  rearWheel.pivot.position.set(0, 0.49, 1.08);
  chassisGroup.add(rearWheel.pivot);

  // 6 & 7. Articulated Swept Delta Wings (Left & Right ExtrudeGeometry airfoils)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(3.4, -0.75);
  wingShape.lineTo(3.6, -1.25);
  wingShape.lineTo(0, -1.05);
  wingShape.closePath();

  const wingExtrudeSettings = {
    steps: 1,
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  };

  const rightWingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);
  rightWingGeo.rotateX(Math.PI / 2);

  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(0.26, 0.88, -0.35);
  const rightWingMesh = new THREE.Mesh(rightWingGeo, wingAirfoilMat);
  rightWingMesh.castShadow = !isSoftwareGl;
  rightWingPivot.add(rightWingMesh);

  // Wingtip accent fin & strobe
  const rightTipFin = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.38, 0.65),
    primaryArmorMat
  );
  rightTipFin.position.set(3.48, 0.14, 0.95);
  rightWingPivot.add(rightTipFin);
  chassisGroup.add(rightWingPivot);

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(-0.26, 0.88, -0.35);
  const leftWingMesh = new THREE.Mesh(rightWingGeo, wingAirfoilMat);
  leftWingMesh.scale.x = -1;
  leftWingMesh.castShadow = !isSoftwareGl;
  leftWingPivot.add(leftWingMesh);

  const leftTipFin = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.38, 0.65),
    primaryArmorMat
  );
  leftTipFin.position.set(-3.48, 0.14, 0.95);
  leftWingPivot.add(leftTipFin);
  chassisGroup.add(leftWingPivot);

  // 8. Twin Rear Tail Stabilizers / Rudders
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.02, 1.05);
  chassisGroup.add(tailGroup);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.45, 0);
  finShape.lineTo(0.7, 0.72);
  finShape.lineTo(0.25, 0.72);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    steps: 1,
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  finGeo.rotateY(Math.PI / 2);

  const leftTailFin = new THREE.Mesh(finGeo, primaryArmorMat);
  leftTailFin.position.set(-0.28, 0, -0.2);
  leftTailFin.rotation.z = 0.28;
  tailGroup.add(leftTailFin);

  const rightTailFin = new THREE.Mesh(finGeo, primaryArmorMat);
  rightTailFin.position.set(0.28, 0, -0.2);
  rightTailFin.rotation.z = -0.28;
  tailGroup.add(rightTailFin);

  // 9. Twin Rocket Booster Pods (LatheGeometry Nozzles + Plasma Plumes)
  const nozzlePoints = [
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.18, 0.15),
    new THREE.Vector2(0.16, 0.55),
    new THREE.Vector2(0.22, 0.75),
    new THREE.Vector2(0.14, 0.75),
  ];
  const nozzleGeo = new THREE.LatheGeometry(nozzlePoints, 16);
  nozzleGeo.rotateX(Math.PI / 2);

  const boosterGroup = new THREE.Group();
  boosterGroup.position.set(0, 0.92, 0.85);
  chassisGroup.add(boosterGroup);

  const leftNozzle = new THREE.Mesh(nozzleGeo, titaniumAlloyMat);
  leftNozzle.position.set(-0.36, 0, 0);
  boosterGroup.add(leftNozzle);

  const rightNozzle = new THREE.Mesh(nozzleGeo, titaniumAlloyMat);
  rightNozzle.position.set(0.36, 0, 0);
  boosterGroup.add(rightNozzle);

  // Animated Flame Cones inside Rocket Boosters
  const flameConeGeo = new THREE.ConeGeometry(0.19, 1.8, 12);
  flameConeGeo.translate(0, -0.9, 0);
  flameConeGeo.rotateX(-Math.PI / 2);

  const innerCoreGeo = new THREE.ConeGeometry(0.1, 1.1, 10);
  innerCoreGeo.translate(0, -0.55, 0);
  innerCoreGeo.rotateX(-Math.PI / 2);

  const leftFlameGroup = new THREE.Group();
  leftFlameGroup.position.set(-0.36, 0, 0.74);
  leftFlameGroup.add(new THREE.Mesh(flameConeGeo, flameOuterMat));
  leftFlameGroup.add(new THREE.Mesh(innerCoreGeo, flameInnerMat));
  boosterGroup.add(leftFlameGroup);

  const rightFlameGroup = new THREE.Group();
  rightFlameGroup.position.set(0.36, 0, 0.74);
  rightFlameGroup.add(new THREE.Mesh(flameConeGeo, flameOuterMat));
  rightFlameGroup.add(new THREE.Mesh(innerCoreGeo, flameInnerMat));
  boosterGroup.add(rightFlameGroup);

  // 10. Submarine Pressurized Glass Bubble Canopy (retracts in Bike mode, closes in Sub/Plane)
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(0, 1.08, -0.65);
  chassisGroup.add(canopyGroup);

  const domeGeo = new THREE.SphereGeometry(
    0.48,
    20,
    14,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52
  );
  domeGeo.scale(0.82, 0.78, 2.25);
  domeGeo.translate(0, 0, 0.65);
  const canopyDome = new THREE.Mesh(domeGeo, canopyGlassMat);
  canopyDome.renderOrder = 12;
  canopyGroup.add(canopyDome);

  // Canopy structural arch rib
  const ribGeo = new THREE.TorusGeometry(0.39, 0.024, 8, 20, Math.PI);
  const canopyRib = new THREE.Mesh(ribGeo, titaniumAlloyMat);
  canopyRib.position.set(0, 0.02, 0.65);
  canopyGroup.add(canopyRib);

  // 11. Submarine Twin Hydro-Propellers (spin underwater)
  const subPropGroup = new THREE.Group();
  subPropGroup.position.set(0, 0.64, 1.38);
  chassisGroup.add(subPropGroup);

  function createPropRotor(): THREE.Group {
    const rotor = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 10),
      titaniumAlloyMat
    );
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.06, 0.018),
        primaryArmorMat
      );
      blade.rotation.z = (i * Math.PI) / 2;
      blade.rotation.x = 0.35;
      rotor.add(blade);
    }
    return rotor;
  }

  const leftPropRotor = createPropRotor();
  leftPropRotor.position.set(-0.28, 0, 0);
  subPropGroup.add(leftPropRotor);

  const rightPropRotor = createPropRotor();
  rightPropRotor.position.set(0.28, 0, 0);
  subPropGroup.add(rightPropRotor);

  // 12. Pilot / Rider Figure (Torso + Aero Helmet + Visor + Arms)
  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 1.08, 0.08);
  chassisGroup.add(riderGroup);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.36, 6, 12),
    carbonFrameMat
  );
  torso.position.set(0, 0.22, -0.06);
  torso.rotation.x = -0.52;
  riderGroup.add(torso);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 16, 14),
    primaryArmorMat
  );
  helmet.scale.set(0.92, 1.0, 1.18);
  helmet.position.set(0, 0.52, -0.24);
  riderGroup.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 14, 10, 0, Math.PI, 0.25, 1.1),
    plasmaGlowMat
  );
  visor.rotation.x = -Math.PI / 2;
  visor.position.set(0, 0.53, -0.28);
  riderGroup.add(visor);

  // Soft Radial Contact Shadow Plane flush on the ground beneath the vehicle
  const shadowGeo = new THREE.PlaneGeometry(3.2, 4.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.03, 0);
  root.add(contactShadow);

  // Internal smoothed morph blend variables
  let planeBlend = 0;
  let subBlend = 0;
  let boostBlend = 0;
  let wheelSpinAngle = 0;

  return {
    root,
    chassisGroup,
    contactShadow,
    updateVisuals(
      dt,
      elapsed,
      mode,
      speedKmh,
      steer,
      pitch,
      isBoosting,
      isUnderwater,
      groundY
    ) {
      const targetPlane = mode === VehicleMode.PLANE ? 1 : 0;
      const targetSub = mode === VehicleMode.SUB ? 1 : 0;
      const targetBoost = isBoosting ? 1 : 0.14;

      planeBlend = THREE.MathUtils.damp(planeBlend, targetPlane, 7.5, dt);
      subBlend = THREE.MathUtils.damp(subBlend, targetSub, 7.5, dt);
      boostBlend = THREE.MathUtils.damp(boostBlend, targetBoost, 12.0, dt);

      // 1. Spin wheels based on forward speed
      const speedMs = speedKmh / 3.6;
      wheelSpinAngle -= speedMs * dt * 2.6;
      frontWheel.spinGroup.rotation.x = wheelSpinAngle;
      rearWheel.spinGroup.rotation.x = wheelSpinAngle;

      // Steer front fork & front wheel
      steeringAssembly.rotation.y = -steer * 0.42;
      frontWheel.pivot.rotation.y = -steer * 0.42;

      // 2. Pivot wheels 90 degrees horizontally into hover/hydro pods in Plane or Sub mode
      const wheelTilt = Math.max(planeBlend, subBlend) * (Math.PI * 0.48);
      frontWheel.pivot.rotation.z = wheelTilt;
      rearWheel.pivot.rotation.z = -wheelTilt;
      const showWheelThruster = wheelTilt > 0.35;
      frontWheel.thrusterGlow.visible = showWheelThruster;
      rearWheel.thrusterGlow.visible = showWheelThruster;

      // 3. Articulate Swept Delta Wings
      // In Bike mode: folded down (-1.35 rad) and swept back
      // In Plane mode: fully extended horizontally (0 rad)
      // In Sub mode: partially extended as hydroplanes (-0.45 rad)
      const wingFoldAngle =
        (1 - planeBlend - subBlend * 0.65) * -1.38 + subBlend * -0.35;
      const wingScale = 0.25 + planeBlend * 0.75 + subBlend * 0.38;
      rightWingPivot.rotation.z = wingFoldAngle;
      leftWingPivot.rotation.z = -wingFoldAngle;
      rightWingPivot.scale.set(wingScale, 1, 1);
      leftWingPivot.scale.set(wingScale, 1, 1);

      // 4. Tail fins deploy taller in Plane & Sub mode
      const tailScale = 0.45 + Math.max(planeBlend, subBlend) * 0.65;
      tailGroup.scale.set(1, tailScale, 1);

      // 5. Pressurized Submarine Bubble Canopy closes in SUB mode (and half-windscreen in PLANE mode)
      const canopyCover = Math.max(subBlend, planeBlend * 0.55);
      canopyGroup.scale.set(1, 0.3 + canopyCover * 0.7, 0.4 + canopyCover * 0.6);
      canopyGroup.rotation.x = (1 - canopyCover) * -0.45;

      // 6. Submarine Rear Hydro-Propellers deploy and spin rapidly in SUB mode
      subPropGroup.scale.setScalar(0.01 + subBlend * 0.99);
      subPropGroup.visible = subBlend > 0.05;
      if (subBlend > 0.05) {
        const propSpin = elapsed * (12 + Math.abs(speedMs) * 0.8);
        leftPropRotor.rotation.z = propSpin;
        rightPropRotor.rotation.z = -propSpin;
      }

      // 7. Rocket Booster Nozzles & Afterburner Plumes
      const pulse = 0.9 + Math.sin(elapsed * 48) * 0.14;
      const flameLength = boostBlend * pulse * (isBoosting ? 1.65 : 0.32);
      const flameRadius = isBoosting ? 1.15 : 0.55;
      leftFlameGroup.scale.set(flameRadius, flameRadius, flameLength);
      rightFlameGroup.scale.set(flameRadius, flameRadius, flameLength);
      leftNozzle.position.x = -0.32 - boostBlend * 0.08;
      rightNozzle.position.x = 0.32 + boostBlend * 0.08;

      // 8. Underwater Sonar Spotlight Cone
      const targetBeamOpacity = isUnderwater ? 0.16 : 0.0;
      beamMat.opacity = THREE.MathUtils.damp(
        beamMat.opacity,
        targetBeamOpacity,
        6,
        dt
      );

      // 9. Dynamic banking / leaning of chassisGroup
      const targetRoll =
        mode === VehicleMode.PLANE
          ? -steer * 0.68
          : mode === VehicleMode.SUB
          ? -steer * 0.42
          : -steer * Math.min(1, Math.abs(speedKmh) / 65) * 0.48;
      const targetPitch =
        mode === VehicleMode.BIKE
          ? isBoosting
            ? 0.14 // subtle wheelie torque under rocket boost
            : pitch * 0.18
          : pitch * 0.52;

      chassisGroup.rotation.z = THREE.MathUtils.damp(
        chassisGroup.rotation.z,
        targetRoll,
        10,
        dt
      );
      chassisGroup.rotation.x = THREE.MathUtils.damp(
        chassisGroup.rotation.x,
        targetPitch,
        10,
        dt
      );

      // 10. Ground Contact Shadow positioning & scale fade with height above ground
      const heightAboveGround = Math.max(0, root.position.y - groundY);
      contactShadow.position.y = groundY - root.position.y + 0.04;
      const shadowFade = Math.max(0, 1 - heightAboveGround / 18);
      shadowMat.opacity = shadowFade * 0.52;
      const shadowScale = 1 + Math.min(1.5, heightAboveGround * 0.06);
      contactShadow.scale.set(shadowScale, 1, shadowScale);
    },
  };
}
