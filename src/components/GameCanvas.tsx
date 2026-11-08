import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from '../audio/SoundEngine';
import {
  CameraPreset,
  CollectibleRing,
  GamePhase,
  InputState,
  TeleportPoint,
  TelemetryState,
  VehicleMode,
  WaypointCoord,
  WeatherType,
} from '../types/game';
import { MISSIONS } from '../world/missionsData';
import { createProceduralTextures } from '../world/ProceduralTextures';
import {
  getRampHeightAt,
  getSurfaceHeight,
  getZoneNameAt,
  isOnHighway,
} from '../world/terrainMath';
import { createTransformingVehicle } from '../world/VehicleBuilder';
import { buildOpenWorld } from '../world/WorldBuilder';

export interface GameControllerHandle {
  setMode: (mode: VehicleMode) => void;
  cycleMode: () => void;
  setWeather: (weather: WeatherType, manual?: boolean) => void;
  toggleWeatherAuto: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  cycleCameraPreset: () => void;
  teleportTo: (point: TeleportPoint) => void;
  selectMission: (missionIndex: number) => void;
  resetVehicle: () => void;
}

interface GameCanvasProps {
  gamePhase: GamePhase;
  inputRef: React.MutableRefObject<InputState>;
  soundEngine: SoundEngine;
  collectiblesRef: React.MutableRefObject<CollectibleRing[]>;
  onTelemetryUpdate: (telemetry: TelemetryState) => void;
  onMissionVictory: () => void;
  controllerRef: React.MutableRefObject<GameControllerHandle | null>;
}

// Pre-allocated scratch vectors/colors at module scope (zero GC in loop)
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();

const WEATHER_ORDER: WeatherType[] = [
  WeatherType.CLEAR,
  WeatherType.RAIN,
  WeatherType.FOG,
  WeatherType.STORM,
];

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gamePhase,
  inputRef,
  soundEngine,
  collectiblesRef,
  onTelemetryUpdate,
  onMissionVictory,
  controllerRef,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const gamePhaseRef = useRef<GamePhase>(gamePhase);
  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    // 1. Software WebGL detection per Three.js skill specification
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    // 2. Scene, Studio Environment Map (RoomEnvironment), Camera & Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd97736);
    scene.fog = new THREE.FogExp2(0xd97736, 0.0014);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.25,
      1800
    );

    // 3. Balanced 3-Point Outdoor + Underwater Studio Rig
    const hemiLight = new THREE.HemisphereLight(0xfde68a, 0x3b2f2f, 0.75);
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(60, 110, 80);
    sunLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      const d = 45;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 260;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
    }
    scene.add(sunLight);
    scene.add(sunLight.target);

    // 4. Build Procedural Textures, Transforming Vehicle, and Open World
    const textures = createProceduralTextures(renderer);
    const vehicle = createTransformingVehicle(
      textures.contactShadowTexture,
      isSoftwareGl
    );
    scene.add(vehicle.root);

    const world = buildOpenWorld(
      scene,
      textures,
      collectiblesRef.current,
      isSoftwareGl
    );

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // =========================================================================
    // 5. SIMULATION STATE (Physics, Boosters, Weather, Missions)
    // =========================================================================
    const state = {
      pos: new THREE.Vector3(0, getSurfaceHeight(0, 880), 880),
      vel: new THREE.Vector3(0, 0, 0),
      forwardSpeed: 0, // m/s
      verticalVel: 0,
      heading: 0, // radians (0 = North along -Z)
      pitchAngle: 0,
      lateralDriftVel: 0,
      mode: VehicleMode.BIKE,
      cameraPreset: CameraPreset.CHASE,

      // Rocket Booster state
      boostFuel: 100,
      boostOverheated: false,
      boostCooldownSec: 0,
      wasBoosting: false,

      // Weather system state
      weather: WeatherType.CLEAR,
      weatherAutoCycle: true,
      weatherTimerSec: 45,
      lightningFlash: 0,

      // Stats & Stunts
      score: 0,
      topSpeedKmh: 0,
      totalAirtimeSec: 0,
      currentJumpAirtime: 0,
      transformedMidAir: false,

      // Mission state
      activeMissionIndex: 0,
      activeWaypointIndex: 0,
      completedMissionIds: [] as string[],
      missionSpeedAchieved: false,
      missionStuntAchieved: false,
      missionCollectedStartCount: 0,

      // Notification banner
      notification: 'OP-01 ACTIVE: Blast down Mirage Highway & hit 230 km/h!' as
        | string
        | null,
      notificationTimer: 5.5,
      shakeIntensity: 0,
    };

    vehicle.root.position.copy(state.pos);

    const showBanner = (msg: string, duration = 4.0) => {
      state.notification = msg;
      state.notificationTimer = duration;
    };

    // Controller methods exposed to React UI
    controllerRef.current = {
      setMode: (newMode: VehicleMode) => {
        if (state.mode === newMode) return;
        state.mode = newMode;
        soundEngine.playTransformSfx(newMode);
        const groundY = getSurfaceHeight(state.pos.x, state.pos.z);
        if (state.pos.y - groundY > 3.5 && newMode === VehicleMode.PLANE) {
          state.transformedMidAir = true;
        }
        showBanner(
          newMode === VehicleMode.PLANE
            ? 'AERO-SHIFT ENGAGED: Swept Wings Deployed'
            : newMode === VehicleMode.SUB
            ? 'HYDRO-SHIFT ENGAGED: Submarine Canopy Sealed'
            : 'TERRA-SHIFT ENGAGED: Off-Road Motorbike Ready',
          2.8
        );
      },
      cycleMode: () => {
        const order = [VehicleMode.BIKE, VehicleMode.PLANE, VehicleMode.SUB];
        const next = order[(order.indexOf(state.mode) + 1) % order.length];
        controllerRef.current?.setMode(next);
      },
      setWeather: (w: WeatherType, manual = true) => {
        state.weather = w;
        if (manual) {
          state.weatherTimerSec = 50;
        }
        showBanner(`WEATHER SHIFT: ${w} CONDITIONS`, 2.5);
      },
      toggleWeatherAuto: () => {
        state.weatherAutoCycle = !state.weatherAutoCycle;
      },
      setCameraPreset: (preset: CameraPreset) => {
        state.cameraPreset = preset;
      },
      cycleCameraPreset: () => {
        const presets = [
          CameraPreset.CHASE,
          CameraPreset.CLOSE,
          CameraPreset.CINEMATIC,
          CameraPreset.COCKPIT,
        ];
        const next =
          presets[(presets.indexOf(state.cameraPreset) + 1) % presets.length];
        state.cameraPreset = next;
        showBanner(`CAMERA VIEW: ${next}`, 2.0);
      },
      teleportTo: (pt: TeleportPoint) => {
        state.pos.set(pt.x, pt.y, pt.z);
        state.forwardSpeed =
          pt.recommendedMode === VehicleMode.PLANE ? 38 : 0;
        state.verticalVel = 0;
        state.lateralDriftVel = 0;
        state.heading = pt.heading;
        state.pitchAngle = 0;
        state.mode = pt.recommendedMode;
        soundEngine.playTransformSfx(pt.recommendedMode);
        showBanner(`FAST TRAVEL: ${pt.name.toUpperCase()}`, 3.2);
      },
      selectMission: (idx: number) => {
        const clamped = Math.max(0, Math.min(MISSIONS.length - 1, idx));
        state.activeMissionIndex = clamped;
        state.activeWaypointIndex = 0;
        state.missionSpeedAchieved = false;
        state.missionStuntAchieved = false;
        const m = MISSIONS[clamped];
        const currentZoneCollected = collectiblesRef.current.filter(
          (c) =>
            c.collected &&
            (!m.collectZone || m.collectZone === 'ANY' || c.zone === m.collectZone)
        ).length;
        state.missionCollectedStartCount = currentZoneCollected;
        showBanner(`${m.code}: ${m.title}`, 4.2);
      },
      resetVehicle: () => {
        const gY = getSurfaceHeight(state.pos.x, state.pos.z);
        state.pos.y = Math.max(gY + 1.5, 4.5);
        state.forwardSpeed = 0;
        state.verticalVel = 0;
        state.lateralDriftVel = 0;
        state.pitchAngle = 0;
        state.boostFuel = 100;
        state.boostOverheated = false;
        showBanner('VEHICLE STABILIZED & BOOST RECHARGED', 2.5);
      },
    };

    // =========================================================================
    // 6. MAIN SIMULATION & RENDER LOOP (with Software-WebGL Guard)
    // =========================================================================
    let frameId = 0;
    let isDisposed = false;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let uiEmitTimer = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const syncState = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (syncState === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepSimulation(dt: number) {
      const phase = gamePhaseRef.current;
      const inp = inputRef.current;

      // Notification timer countdown
      if (state.notificationTimer > 0) {
        state.notificationTimer -= dt;
        if (state.notificationTimer <= 0) {
          state.notification = null;
        }
      }

      // Dynamic Weather Auto-Cycle
      if (phase === GamePhase.PLAYING && state.weatherAutoCycle) {
        state.weatherTimerSec -= dt;
        if (state.weatherTimerSec <= 0) {
          state.weatherTimerSec = 50;
          const nextIdx =
            (WEATHER_ORDER.indexOf(state.weather) + 1) % WEATHER_ORDER.length;
          state.weather = WEATHER_ORDER[nextIdx];
          showBanner(
            `DYNAMIC WEATHER: Transitioning to ${state.weather}`,
            3.2
          );
        }
      }

      // Weather physical modifiers (Traction & Wind Turbulence)
      const tractionMultiplier =
        state.weather === WeatherType.STORM
          ? 0.7
          : state.weather === WeatherType.RAIN
          ? 0.76
          : state.weather === WeatherType.FOG
          ? 0.9
          : 1.0;

      const windTurbulence =
        state.weather === WeatherType.STORM
          ? 1.0
          : state.weather === WeatherType.RAIN
          ? 0.35
          : 0.0;

      // Title screen cinematic orbit around vehicle on Mirage Highway
      if (phase === GamePhase.TITLE) {
        const groundY = getSurfaceHeight(state.pos.x, state.pos.z);
        state.pos.y = groundY;
        vehicle.root.position.copy(state.pos);
        vehicle.root.rotation.y = state.heading;

        // Cycle demonstration morphs gently on title screen
        const demoPhase = Math.floor((elapsedTotal * 0.25) % 3);
        const demoMode =
          demoPhase === 0
            ? VehicleMode.BIKE
            : demoPhase === 1
            ? VehicleMode.PLANE
            : VehicleMode.SUB;

        vehicle.updateVisuals(
          dt,
          elapsedTotal,
          demoMode,
          65,
          Math.sin(elapsedTotal * 0.8) * 0.25,
          0,
          true,
          false,
          groundY
        );

        const orbitAngle = elapsedTotal * 0.32;
        camera.position.set(
          state.pos.x + Math.sin(orbitAngle) * 7.2,
          state.pos.y + 2.8 + Math.sin(elapsedTotal * 0.6) * 0.5,
          state.pos.z + Math.cos(orbitAngle) * 7.2
        );
        camera.lookAt(state.pos.x, state.pos.y + 1.1, state.pos.z);

        world.updateWorld(
          dt,
          elapsedTotal,
          state.pos,
          true,
          false,
          65,
          state.weather,
          null
        );
        soundEngine.update(
          dt,
          0,
          state.mode,
          false,
          false,
          state.weather,
          false
        );
        return;
      }

      if (phase !== GamePhase.PLAYING) {
        soundEngine.update(
          dt,
          0,
          state.mode,
          false,
          false,
          state.weather,
          false
        );
        return;
      }

      // =====================================================================
      // ROCKET BOOSTER RESOURCE & COOLDOWN MANAGEMENT
      // =====================================================================
      if (state.boostOverheated) {
        state.boostCooldownSec = Math.max(0, state.boostCooldownSec - dt);
        state.boostFuel = Math.min(100, state.boostFuel + 26 * dt);
        if (state.boostCooldownSec <= 0 && state.boostFuel >= 35) {
          state.boostOverheated = false;
        }
      }

      const canBoost =
        inp.boost && !state.boostOverheated && state.boostFuel > 0.5;
      if (canBoost) {
        if (!state.wasBoosting) {
          soundEngine.playBoostIgniteSfx();
          state.shakeIntensity = Math.max(state.shakeIntensity, 0.25);
        }
        state.boostFuel = Math.max(0, state.boostFuel - 26 * dt);
        if (state.boostFuel <= 0.5) {
          state.boostFuel = 0;
          state.boostOverheated = true;
          state.boostCooldownSec = 2.6;
          showBanner('BOOSTERS OVERHEATED: Cooling Down (2.5s)', 2.4);
        }
      } else if (!state.boostOverheated) {
        state.boostFuel = Math.min(100, state.boostFuel + 16 * dt);
      }
      state.wasBoosting = canBoost;

      // =====================================================================
      // TRI-MODAL VEHICLE PHYSICS (BIKE / PLANE / SUB)
      // =====================================================================
      const prevGroundY = getSurfaceHeight(state.pos.x, state.pos.z);
      const isUnderwater = state.pos.y < -0.5;

      // Auto-engage Submarine mode if diving deep below -5m in Bike mode
      if (state.pos.y < -5.5 && state.mode === VehicleMode.BIKE) {
        controllerRef.current?.setMode(VehicleMode.SUB);
      }

      if (state.mode === VehicleMode.BIKE) {
        const onRoad = isOnHighway(state.pos.x, state.pos.z);
        const maxBaseSpeed = onRoad ? 62 : 48; // m/s (~223 km/h road, ~172 km/h offroad)
        const maxBoostSpeed = 89; // ~320 km/h with Rocket Boosters!
        const targetMax = canBoost ? maxBoostSpeed : maxBaseSpeed;

        const accel = canBoost
          ? 44
          : inp.throttle > 0
          ? 24 * tractionMultiplier
          : inp.throttle < 0
          ? 34
          : 0;

        if (canBoost) {
          state.forwardSpeed = THREE.MathUtils.damp(
            state.forwardSpeed,
            maxBoostSpeed,
            2.4,
            dt
          );
        } else if (inp.throttle > 0) {
          state.forwardSpeed = Math.min(
            targetMax,
            state.forwardSpeed + inp.throttle * accel * dt
          );
        } else if (inp.throttle < 0) {
          state.forwardSpeed = Math.max(
            -18,
            state.forwardSpeed + inp.throttle * accel * dt
          );
        } else {
          // Natural rolling resistance
          const drag = onRoad ? 0.9 : 1.8;
          state.forwardSpeed = THREE.MathUtils.damp(
            state.forwardSpeed,
            0,
            drag,
            dt
          );
        }

        // Steering & Rain/Storm Drift Physics
        const speedFactor = Math.min(1, Math.abs(state.forwardSpeed) / 14);
        const turnRate =
          (1.65 - Math.min(0.65, Math.abs(state.forwardSpeed) / 110)) *
          (0.65 + 0.35 * tractionMultiplier);
        const dirSign = state.forwardSpeed >= -0.5 ? 1 : -1;
        state.heading -= inp.steer * turnRate * speedFactor * dirSign * dt;

        // Lateral slip when turning hard in Rain or Storm
        const targetSlip =
          -inp.steer *
          Math.abs(state.forwardSpeed) *
          (1 - tractionMultiplier) *
          0.32;
        state.lateralDriftVel = THREE.MathUtils.damp(
          state.lateralDriftVel,
          targetSlip,
          4.5,
          dt
        );

        // Advance horizontal position
        _forwardVec.set(-Math.sin(state.heading), 0, -Math.cos(state.heading));
        state.pos.addScaledVector(_forwardVec, state.forwardSpeed * dt);
        // Apply lateral drift perpendicular to heading
        state.pos.x += Math.cos(state.heading) * state.lateralDriftVel * dt;
        state.pos.z -= Math.sin(state.heading) * state.lateralDriftVel * dt;

        const newGroundY = getSurfaceHeight(state.pos.x, state.pos.z);
        const rampH = getRampHeightAt(state.pos.x, state.pos.z);

        // Check if grounded or airborne
        if (state.pos.y <= newGroundY + 0.28 && state.verticalVel <= 4.0) {
          // Follow slope & compute launch vertical velocity when ascending stunt ramps
          const slopeRise = (newGroundY - prevGroundY) / Math.max(0.001, dt);
          if (rampH > 0.2 && state.forwardSpeed > 15) {
            state.verticalVel = Math.max(0, slopeRise * 1.15);
            // Instant small boost refill on stunt ramps
            state.boostFuel = Math.min(100, state.boostFuel + 18 * dt);
          } else {
            state.verticalVel = 0;
          }
          state.pos.y = newGroundY;

          // Jump / Bunny-Hop
          if (inp.jumpOrAscend) {
            state.verticalVel = 12.5;
            state.pos.y += 0.25;
          }

          if (state.currentJumpAirtime > 1.2) {
            const stuntPts = Math.round(state.currentJumpAirtime * 120);
            state.score += stuntPts;
            state.boostFuel = Math.min(100, state.boostFuel + 25);
          }
          state.currentJumpAirtime = 0;
          state.transformedMidAir = false;
        } else {
          // Airborne gravity
          state.verticalVel -= 24.5 * dt;
          state.pos.y += state.verticalVel * dt;
          state.totalAirtimeSec += dt;
          state.currentJumpAirtime += dt;

          if (state.pos.y <= newGroundY) {
            state.pos.y = newGroundY;
            state.verticalVel = 0;
          }
        }
      } else if (state.mode === VehicleMode.PLANE) {
        // ===================================================================
        // PLANE / JET-BIKE AERODYNAMIC FLIGHT PHYSICS
        // ===================================================================
        const minCruiseSpeed = 32; // m/s (~115 km/h minimum stall-free cruise)
        const maxFlightSpeed = canBoost ? 95 : 68; // up to 342 km/h with Rocket Boosters!
        const targetFlightSpeed = canBoost
          ? maxFlightSpeed
          : inp.throttle > 0
          ? 68
          : inp.throttle < 0
          ? 26
          : 46;

        state.forwardSpeed = THREE.MathUtils.damp(
          state.forwardSpeed,
          targetFlightSpeed,
          canBoost ? 3.2 : 1.8,
          dt
        );

        // Storm crosswind turbulence
        const stormRollGust =
          windTurbulence *
          (Math.sin(elapsedTotal * 3.7) * 0.25 +
            Math.cos(elapsedTotal * 6.1) * 0.15);

        state.heading -= (inp.steer * 1.35 + stormRollGust * 0.3) * dt;

        // Pitch input (W/S or Pitch buttons or Jump/Dive)
        let pitchInput = inp.pitch;
        if (inp.jumpOrAscend) pitchInput = 0.85;
        else if (inp.dive) pitchInput = -0.85;

        const targetPitchAngle = THREE.MathUtils.clamp(
          pitchInput * 0.58,
          -0.65,
          0.65
        );
        state.pitchAngle = THREE.MathUtils.damp(
          state.pitchAngle,
          targetPitchAngle,
          5.0,
          dt
        );

        const horizSpeed = Math.cos(state.pitchAngle) * state.forwardSpeed;
        state.verticalVel = Math.sin(state.pitchAngle) * state.forwardSpeed;

        state.pos.x += -Math.sin(state.heading) * horizSpeed * dt;
        state.pos.z += -Math.cos(state.heading) * horizSpeed * dt;
        state.pos.y += state.verticalVel * dt;

        // Track airtime
        const newGroundY = getSurfaceHeight(state.pos.x, state.pos.z);
        if (state.pos.y > newGroundY + 2.0) {
          state.totalAirtimeSec += dt;
          state.currentJumpAirtime += dt;
        }

        // Prevent flying below terrain floor; if diving into deep ocean, allow entering water
        if (state.pos.y < newGroundY + 0.6) {
          state.pos.y = newGroundY + 0.6;
          if (state.pitchAngle < 0) state.pitchAngle = 0;
        }
        // Ceiling cap
        if (state.pos.y > 260) {
          state.pos.y = 260;
        }
      } else {
        // ===================================================================
        // SUBMARINE / HYDRO-BIKE UNDERWATER & SURFACE PHYSICS
        // ===================================================================
        const maxSubSpeed = canBoost ? 54 : 34; // up to ~195 km/h hydro-torpedo surge!
        const targetSubSpeed = canBoost
          ? maxSubSpeed
          : inp.throttle !== 0
          ? inp.throttle * maxSubSpeed
          : 0;

        state.forwardSpeed = THREE.MathUtils.damp(
          state.forwardSpeed,
          targetSubSpeed,
          canBoost ? 3.5 : 2.2,
          dt
        );

        state.heading -= inp.steer * 1.55 * dt;

        // Vertical depth control (Dive / Ascend / Pitch)
        let depthInput = inp.pitch;
        if (inp.jumpOrAscend) depthInput = 1.0;
        else if (inp.dive) depthInput = -1.0;

        state.pitchAngle = THREE.MathUtils.damp(
          state.pitchAngle,
          depthInput * 0.45,
          5.0,
          dt
        );

        const verticalRate = depthInput * (canBoost ? 22 : 14);
        state.verticalVel = THREE.MathUtils.damp(
          state.verticalVel,
          verticalRate,
          4.5,
          dt
        );

        state.pos.x += -Math.sin(state.heading) * state.forwardSpeed * dt;
        state.pos.z += -Math.cos(state.heading) * state.forwardSpeed * dt;
        state.pos.y += state.verticalVel * dt;

        const seaFloorY = getSurfaceHeight(state.pos.x, state.pos.z);
        if (state.pos.y < seaFloorY + 0.4) {
          state.pos.y = seaFloorY + 0.4;
          state.verticalVel = Math.max(0, state.verticalVel);
        }
        // If on northern ocean, cap submarine surface height near y = 0.5 unless launching out
        if (state.pos.z < -860 && state.pos.y > 1.2 && !canBoost) {
          state.pos.y = 1.2;
          state.verticalVel = Math.min(0, state.verticalVel);
        }
      }

      // World boundary clamping (natural mountain/ocean perimeters)
      state.pos.x = THREE.MathUtils.clamp(state.pos.x, -620, 620);
      state.pos.z = THREE.MathUtils.clamp(state.pos.z, -1880, 1120);

      // Update vehicle 3D transform & articulated sub-parts
      const currentGroundY = getSurfaceHeight(state.pos.x, state.pos.z);
      const speedKmh = Math.abs(state.forwardSpeed) * 3.6;
      if (speedKmh > state.topSpeedKmh) {
        state.topSpeedKmh = speedKmh;
      }

      vehicle.root.position.copy(state.pos);
      vehicle.root.rotation.y = state.heading;

      vehicle.updateVisuals(
        dt,
        elapsedTotal,
        state.mode,
        speedKmh,
        inp.steer,
        state.pitchAngle,
        canBoost,
        isUnderwater,
        currentGroundY
      );

      // =====================================================================
      // COLLECTIBLES & RELIC COLLISION DETECTION
      // =====================================================================
      const rings = collectiblesRef.current;
      let totalCollected = 0;
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        if (r.collected) {
          totalCollected++;
          continue;
        }
        const distSq =
          (state.pos.x - r.x) ** 2 +
          (state.pos.y - r.y) ** 2 +
          (state.pos.z - r.z) ** 2;
        if (distSq <= 42) {
          r.collected = true;
          totalCollected++;
          state.score += 250;
          state.boostFuel = Math.min(100, state.boostFuel + 35);
          state.boostOverheated = false;
          const meshGroup = world.collectibleMeshes.get(r.id);
          if (meshGroup) meshGroup.visible = false;
          soundEngine.playCollectSfx(false);
          showBanner(`COLLECTED: ${r.label} (+250 PTS & +35% BOOST)`, 3.0);
        }
      }

      // =====================================================================
      // MISSION OBJECTIVES EVALUATION
      // =====================================================================
      const currentMission = MISSIONS[state.activeMissionIndex];
      let activeWaypoint: WaypointCoord | null = null;
      let missionProgressText = '';
      let missionProgressRatio = 0;

      if (currentMission) {
        if (
          currentMission.targetSpeedKmh &&
          speedKmh >= currentMission.targetSpeedKmh
        ) {
          state.missionSpeedAchieved = true;
        }

        if (
          currentMission.targetAirtimeSec &&
          state.currentJumpAirtime >= currentMission.targetAirtimeSec &&
          state.mode === VehicleMode.PLANE
        ) {
          state.missionStuntAchieved = true;
        }

        if (
          currentMission.waypoints &&
          state.activeWaypointIndex < currentMission.waypoints.length
        ) {
          activeWaypoint =
            currentMission.waypoints[state.activeWaypointIndex];
          const wpDist = Math.hypot(
            state.pos.x - activeWaypoint.x,
            state.pos.y - activeWaypoint.y,
            state.pos.z - activeWaypoint.z
          );

          const modeMatches =
            !activeWaypoint.requiredMode ||
            state.mode === activeWaypoint.requiredMode;

          if (wpDist <= activeWaypoint.radius && modeMatches) {
            state.activeWaypointIndex++;
            state.score += 300;
            state.boostFuel = 100;
            soundEngine.playCollectSfx(true);
            if (state.activeWaypointIndex < currentMission.waypoints.length) {
              const nextWp =
                currentMission.waypoints[state.activeWaypointIndex];
              showBanner(`CHECKPOINT CLEARED! Next: ${nextWp.label}`, 3.2);
            }
          }
        }

        // Compute progress text & completion check
        if (currentMission.type === 'WAYPOINT' || currentMission.type === 'TRIATHLON') {
          const totalWps = currentMission.waypoints?.length || 1;
          const doneWps = state.activeWaypointIndex;
          if (currentMission.targetSpeedKmh) {
            const spdDone = state.missionSpeedAchieved ? 1 : 0;
            missionProgressRatio = (doneWps + spdDone) / (totalWps + 1);
            missionProgressText = `Gates: ${doneWps}/${totalWps} · Speed ${Math.round(
              Math.min(currentMission.targetSpeedKmh, state.topSpeedKmh)
            )}/${currentMission.targetSpeedKmh} km/h`;
            if (doneWps >= totalWps && state.missionSpeedAchieved) {
              completeCurrentMission();
            }
          } else {
            missionProgressRatio = doneWps / totalWps;
            missionProgressText = `Waypoints: ${doneWps}/${totalWps} (${
              activeWaypoint ? activeWaypoint.label : 'Complete'
            })`;
            if (doneWps >= totalWps) {
              completeCurrentMission();
            }
          }
        } else if (currentMission.type === 'STUNT') {
          const totalWps = currentMission.waypoints?.length || 1;
          const doneWps = state.activeWaypointIndex;
          const airtimeGoal = currentMission.targetAirtimeSec || 3.5;
          const bestAir = state.missionStuntAchieved
            ? airtimeGoal
            : Math.min(airtimeGoal, state.currentJumpAirtime);
          missionProgressRatio =
            (bestAir / airtimeGoal) * 0.5 + (doneWps / totalWps) * 0.5;
          missionProgressText = `Airtime: ${bestAir.toFixed(
            1
          )}/${airtimeGoal.toFixed(1)}s · Sky Beacon: ${doneWps}/${totalWps}`;
          if (doneWps >= totalWps && state.missionStuntAchieved) {
            completeCurrentMission();
          }
        } else if (currentMission.type === 'COLLECT') {
          const goal = currentMission.targetCollectCount || 5;
          const currentAbyssCount = rings.filter(
            (c) =>
              c.collected &&
              (!currentMission.collectZone ||
                currentMission.collectZone === 'ANY' ||
                c.zone === currentMission.collectZone)
          ).length;
          const progressCount = Math.min(goal, currentAbyssCount);
          missionProgressRatio = progressCount / goal;
          missionProgressText = `Aethelgard Relics: ${progressCount}/${goal} Recovered`;

          // Point waypoint beacon to nearest uncollected relic in that zone
          let nearestDist = Infinity;
          for (let i = 0; i < rings.length; i++) {
            const c = rings[i];
            if (!c.collected && c.zone === currentMission.collectZone) {
              const d = Math.hypot(
                state.pos.x - c.x,
                state.pos.y - c.y,
                state.pos.z - c.z
              );
              if (d < nearestDist) {
                nearestDist = d;
                activeWaypoint = {
                  x: c.x,
                  y: c.y,
                  z: c.z,
                  radius: 12,
                  label: c.label,
                };
              }
            }
          }

          if (progressCount >= goal) {
            completeCurrentMission();
          }
        }
      }

      function completeCurrentMission() {
        const m = MISSIONS[state.activeMissionIndex];
        if (!m) return;
        if (!state.completedMissionIds.includes(m.id)) {
          state.completedMissionIds.push(m.id);
          state.score += m.rewardPoints;
        }
        soundEngine.playCollectSfx(true);

        if (state.activeMissionIndex < MISSIONS.length - 1) {
          state.activeMissionIndex++;
          state.activeWaypointIndex = 0;
          state.missionSpeedAchieved = false;
          state.missionStuntAchieved = false;
          const nextM = MISSIONS[state.activeMissionIndex];
          showBanner(
            `MISSION COMPLETE (+${m.rewardPoints} PTS)! NEXT: ${nextM.code} ${nextM.title}`,
            5.0
          );
        } else {
          showBanner(
            `ALL 6 OPERATIONS COMPLETED! Apex Nomad Master (+${m.rewardPoints} PTS)`,
            6.0
          );
          onMissionVictory();
        }
      }

      // =====================================================================
      // DYNAMIC ATMOSPHERE, LIGHTING & FOG TRANSITIONS (Sky / Weather / Underwater)
      // =====================================================================
      if (isUnderwater) {
        // Deep bioluminescent Abyssal Teal atmosphere
        _skyColor.setHex(0x041e2e);
        _fogColor.setHex(0x052c42);
        const fogExp = scene.fog as THREE.FogExp2;
        fogExp.color.lerp(_fogColor, dt * 6);
        fogExp.density = THREE.MathUtils.damp(fogExp.density, 0.0085, 4, dt);
        scene.background = fogExp.color;
        sunLight.intensity = THREE.MathUtils.damp(sunLight.intensity, 0.65, 4, dt);
        hemiLight.intensity = THREE.MathUtils.damp(hemiLight.intensity, 1.1, 4, dt);
      } else {
        // Above water: blend sky & fog based on WeatherType
        let targetDensity = 0.0011;
        let targetSunInt = 2.2;

        if (state.weather === WeatherType.CLEAR) {
          _skyColor.setHex(0xd97736);
          _fogColor.setHex(0xe08e52);
          targetDensity = 0.0011;
          targetSunInt = 2.2;
        } else if (state.weather === WeatherType.RAIN) {
          _skyColor.setHex(0x334155);
          _fogColor.setHex(0x475569);
          targetDensity = 0.0032;
          targetSunInt = 0.95;
        } else if (state.weather === WeatherType.FOG) {
          _skyColor.setHex(0x94a3b8);
          _fogColor.setHex(0x94a3b8);
          targetDensity = 0.0072;
          targetSunInt = 0.8;
        } else {
          // STORM with periodic lightning flash
          _skyColor.setHex(0x1e293b);
          _fogColor.setHex(0x1e293b);
          targetDensity = 0.0046;
          targetSunInt = 0.65;
          if (Math.random() < dt * 0.25) {
            state.lightningFlash = 1.0;
          }
        }

        if (state.lightningFlash > 0) {
          state.lightningFlash = Math.max(0, state.lightningFlash - dt * 4.5);
          targetSunInt += state.lightningFlash * 3.5;
          _fogColor.lerp(new THREE.Color(0xe0f2fe), state.lightningFlash * 0.5);
        }

        const fogExp = scene.fog as THREE.FogExp2;
        fogExp.color.lerp(_fogColor, dt * 3.5);
        fogExp.density = THREE.MathUtils.damp(
          fogExp.density,
          targetDensity,
          3.0,
          dt
        );
        scene.background = fogExp.color;
        sunLight.intensity = THREE.MathUtils.damp(
          sunLight.intensity,
          targetSunInt,
          4,
          dt
        );
      }

      // Move directional shadow frustum with player
      sunLight.position.set(
        state.pos.x + 50,
        state.pos.y + 95,
        state.pos.z + 65
      );
      sunLight.target.position.copy(state.pos);

      // =====================================================================
      // SMOOTH DAMPED CAMERA CHOREOGRAPHY & FOV SPEED CUES
      // =====================================================================
      const targetFov = canBoost
        ? 78
        : 60 + Math.min(14, (speedKmh / 240) * 14);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
        camera.updateProjectionMatrix();
      }

      let camDist = 7.8;
      let camHeight = 2.65;
      let lookAhead = 6.0;

      if (state.cameraPreset === CameraPreset.CLOSE) {
        camDist = 5.2;
        camHeight = 1.95;
        lookAhead = 8.0;
      } else if (state.cameraPreset === CameraPreset.CINEMATIC) {
        camDist = 12.5;
        camHeight = 4.4;
        lookAhead = 4.0;
      } else if (state.cameraPreset === CameraPreset.COCKPIT) {
        camDist = -0.35;
        camHeight = 1.58;
        lookAhead = 18.0;
      }

      const sinH = Math.sin(state.heading);
      const cosH = Math.cos(state.heading);

      _camTargetPos.set(
        state.pos.x + sinH * camDist,
        state.pos.y +
          camHeight -
          (state.mode !== VehicleMode.BIKE ? state.pitchAngle * 2.5 : 0),
        state.pos.z + cosH * camDist
      );

      // Prevent camera from clipping below terrain
      const camGroundY = getSurfaceHeight(_camTargetPos.x, _camTargetPos.z);
      if (_camTargetPos.y < camGroundY + 0.8) {
        _camTargetPos.y = camGroundY + 0.8;
      }

      const dampLambda =
        state.cameraPreset === CameraPreset.COCKPIT ? 28 : 11;
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        _camTargetPos.x,
        dampLambda,
        dt
      );
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        _camTargetPos.y,
        dampLambda,
        dt
      );
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        _camTargetPos.z,
        dampLambda,
        dt
      );

      // Subtle decaying camera shake on booster ignition
      if (state.shakeIntensity > 0.001) {
        camera.position.x +=
          (Math.random() - 0.5) * state.shakeIntensity * 0.35;
        camera.position.y +=
          (Math.random() - 0.5) * state.shakeIntensity * 0.35;
        state.shakeIntensity = Math.max(0, state.shakeIntensity - dt * 0.9);
      }

      _camLookAt.set(
        state.pos.x - sinH * lookAhead,
        state.pos.y +
          1.25 +
          (state.mode !== VehicleMode.BIKE ? state.pitchAngle * 4.5 : 0),
        state.pos.z - cosH * lookAhead
      );
      camera.lookAt(_camLookAt);

      // Update world particles, collectibles & mission beacon
      world.updateWorld(
        dt,
        elapsedTotal,
        state.pos,
        canBoost,
        isUnderwater,
        speedKmh,
        state.weather,
        activeWaypoint
      );

      // Update procedural engine & booster audio
      soundEngine.update(
        dt,
        speedKmh,
        state.mode,
        canBoost,
        isUnderwater,
        state.weather,
        true
      );

      // Emit telemetry to HUD at ~15Hz so React never bottlenecks 60fps loop
      uiEmitTimer += dt;
      if (uiEmitTimer >= 0.065) {
        uiEmitTimer = 0;
        const headingDeg =
          (((-state.heading * 180) / Math.PI) % 360 + 360) % 360;
        const distToCity = Math.round(
          Math.hypot(state.pos.x, state.pos.z + 1550)
        );

        let nextWpDist: number | null = null;
        let nextWpBearing: number | null = null;
        if (activeWaypoint) {
          nextWpDist = Math.round(
            Math.hypot(
              state.pos.x - activeWaypoint.x,
              state.pos.y - activeWaypoint.y,
              state.pos.z - activeWaypoint.z
            )
          );
          const dx = activeWaypoint.x - state.pos.x;
          const dz = activeWaypoint.z - state.pos.z;
          const rawAngle = (Math.atan2(dx, -dz) * 180) / Math.PI;
          nextWpBearing = ((rawAngle - headingDeg + 540) % 360) - 180;
        }

        onTelemetryUpdate({
          speedKmh: Math.round(speedKmh),
          altitudeM: Math.max(0, Math.round(state.pos.y)),
          depthM: state.pos.y < 0 ? Math.round(Math.abs(state.pos.y)) : 0,
          boostFuel: Math.round(state.boostFuel),
          boostOverheated: state.boostOverheated,
          boostCooldownSec: Number(state.boostCooldownSec.toFixed(1)),
          isBoosting: canBoost,
          mode: state.mode,
          weather: state.weather,
          weatherAutoCycle: state.weatherAutoCycle,
          weatherTimerSec: Math.ceil(state.weatherTimerSec),
          tractionMultiplier,
          windTurbulence,
          zoneName: getZoneNameAt(state.pos.x, state.pos.y, state.pos.z),
          isUnderwater,
          isAirborne: state.pos.y - currentGroundY > 1.2,
          score: state.score,
          collectedCount: totalCollected,
          totalCollectibles: rings.length,
          topSpeedKmh: Math.round(state.topSpeedKmh),
          airtimeSeconds: Number(state.totalAirtimeSec.toFixed(1)),
          currentJumpAirtime: Number(state.currentJumpAirtime.toFixed(1)),
          headingDeg: Math.round(headingDeg),
          distanceToCityM: distToCity,
          activeMissionId: currentMission ? currentMission.id : '',
          activeMissionIndex: state.activeMissionIndex,
          completedMissionIds: [...state.completedMissionIds],
          missionProgressText,
          missionProgressRatio,
          nextWaypointDistanceM: nextWpDist,
          nextWaypointBearingDeg: nextWpBearing,
          nextWaypointLabel: activeWaypoint ? activeWaypoint.label : null,
          notification: state.notification,
        });
      }
    }

    function tick() {
      if (isDisposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      // Clamp frame delta time per Game Craft guidelines
      const dt = Math.min(rawDt, 0.05);
      elapsedTotal += dt;

      stepSimulation(dt);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      textures.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={canvasMountRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden z-0"
    />
  );
};
