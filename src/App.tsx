import { useCallback, useEffect, useRef, useState } from 'react';
import { SoundEngine } from './audio/SoundEngine';
import { GameCanvas, GameControllerHandle } from './components/GameCanvas';
import { GameOverlayHUD } from './components/GameOverlayHUD';
import {
  CollectibleRing,
  GamePhase,
  InputState,
  TelemetryState,
  VehicleMode,
  WeatherType,
} from './types/game';
import { createInitialCollectibles, MISSIONS } from './world/missionsData';

const INITIAL_TELEMETRY: TelemetryState = {
  speedKmh: 0,
  altitudeM: 4,
  depthM: 0,
  boostFuel: 100,
  boostOverheated: false,
  boostCooldownSec: 0,
  isBoosting: false,
  mode: VehicleMode.BIKE,
  weather: WeatherType.CLEAR,
  weatherAutoCycle: true,
  weatherTimerSec: 45,
  tractionMultiplier: 1.0,
  windTurbulence: 0,
  zoneName: 'Mirage Straightaway Highway',
  isUnderwater: false,
  isAirborne: false,
  score: 0,
  collectedCount: 0,
  totalCollectibles: 30,
  topSpeedKmh: 0,
  airtimeSeconds: 0,
  currentJumpAirtime: 0,
  headingDeg: 0,
  distanceToCityM: 2430,
  activeMissionId: MISSIONS[0].id,
  activeMissionIndex: 0,
  completedMissionIds: [],
  missionProgressText: 'Gates: 0/3 · Speed 0/230 km/h',
  missionProgressRatio: 0,
  nextWaypointDistanceM: 230,
  nextWaypointBearingDeg: 0,
  nextWaypointLabel: 'South Highway Gate',
  notification: null,
};

export default function App() {
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.TITLE);
  const [telemetry, setTelemetry] =
    useState<TelemetryState>(INITIAL_TELEMETRY);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const inputRef = useRef<InputState>({
    throttle: 0,
    steer: 0,
    pitch: 0,
    boost: false,
    jumpOrAscend: false,
    dive: false,
  });

  const collectiblesRef = useRef<CollectibleRing[]>(
    createInitialCollectibles()
  );
  const controllerRef = useRef<GameControllerHandle | null>(null);
  const soundEngineRef = useRef<SoundEngine | null>(null);
  if (!soundEngineRef.current) {
    soundEngineRef.current = new SoundEngine();
  }

  const handleStartGame = useCallback(() => {
    soundEngineRef.current?.resume();
    setGamePhase(GamePhase.PLAYING);
  }, []);

  const handleTogglePause = useCallback(() => {
    setGamePhase((prev) =>
      prev === GamePhase.PLAYING ? GamePhase.PAUSED : GamePhase.PLAYING
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!soundEngineRef.current) return;
    const next = !soundEngineRef.current.getMuted();
    soundEngineRef.current.setMuted(next);
    setIsMuted(next);
  }, []);

  // Keyboard & Window Blur Input Handling
  useEffect(() => {
    const heldKeys = new Set<string>();

    const recomputeContinuousInputs = () => {
      const forward =
        heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0;
      const backward =
        heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? -1 : 0;
      const left =
        heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? -1 : 0;
      const right =
        heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0;

      inputRef.current.throttle = forward + backward;
      inputRef.current.steer = left + right;
      inputRef.current.pitch = forward + backward;
      inputRef.current.boost =
        heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight');
      inputRef.current.jumpOrAscend = heldKeys.has('Space');
      inputRef.current.dive = heldKeys.has('KeyQ');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Title screen start shortcut
      if (
        gamePhase === GamePhase.TITLE &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        e.preventDefault();
        handleStartGame();
        return;
      }

      if (e.repeat) return;

      // Edge-triggered actions
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gamePhase === GamePhase.PLAYING || gamePhase === GamePhase.PAUSED) {
          handleTogglePause();
        }
        return;
      }

      if (gamePhase === GamePhase.PLAYING) {
        if (e.code === 'Digit1') {
          controllerRef.current?.setMode(VehicleMode.BIKE);
        } else if (e.code === 'Digit2') {
          controllerRef.current?.setMode(VehicleMode.PLANE);
        } else if (e.code === 'Digit3') {
          controllerRef.current?.setMode(VehicleMode.SUB);
        } else if (e.code === 'KeyE') {
          controllerRef.current?.cycleMode();
        } else if (e.code === 'KeyC') {
          controllerRef.current?.cycleCameraPreset();
        } else if (e.code === 'KeyR') {
          controllerRef.current?.resetVehicle();
        } else if (e.code === 'KeyM') {
          handleToggleMute();
        }
      }

      heldKeys.add(e.code);
      recomputeContinuousInputs();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
      recomputeContinuousInputs();
    };

    const handleWindowBlur = () => {
      heldKeys.clear();
      inputRef.current.throttle = 0;
      inputRef.current.steer = 0;
      inputRef.current.pitch = 0;
      inputRef.current.boost = false;
      inputRef.current.jumpOrAscend = false;
      inputRef.current.dive = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [gamePhase, handleStartGame, handleTogglePause, handleToggleMute]);

  useEffect(() => {
    return () => {
      soundEngineRef.current?.dispose();
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      <GameCanvas
        gamePhase={gamePhase}
        inputRef={inputRef}
        soundEngine={soundEngineRef.current}
        collectiblesRef={collectiblesRef}
        onTelemetryUpdate={setTelemetry}
        onMissionVictory={() => setGamePhase(GamePhase.VICTORY)}
        controllerRef={controllerRef}
      />

      <GameOverlayHUD
        gamePhase={gamePhase}
        telemetry={telemetry}
        inputRef={inputRef}
        controllerRef={controllerRef}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onStartGame={handleStartGame}
        onTogglePause={handleTogglePause}
        onDismissVictory={() => setGamePhase(GamePhase.PLAYING)}
      />
    </main>
  );
}
