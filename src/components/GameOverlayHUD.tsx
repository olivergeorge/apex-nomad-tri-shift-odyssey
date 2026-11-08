import React, { useRef, useState } from 'react';
import {
  Compass,
  CloudRain,
  CloudFog,
  CloudLightning,
  Sun,
  Flame,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Camera,
  ChevronDown,
  ChevronUp,
  Navigation,
  Target,
  CheckCircle2,
} from 'lucide-react';
import {
  GamePhase,
  InputState,
  TelemetryState,
  VehicleMode,
  WeatherType,
} from '../types/game';
import { MISSIONS, TELEPORT_POINTS } from '../world/missionsData';
import { GameControllerHandle } from './GameCanvas';

interface GameOverlayHUDProps {
  gamePhase: GamePhase;
  telemetry: TelemetryState;
  inputRef: React.MutableRefObject<InputState>;
  controllerRef: React.MutableRefObject<GameControllerHandle | null>;
  isMuted: boolean;
  onToggleMute: () => void;
  onStartGame: () => void;
  onTogglePause: () => void;
  onDismissVictory: () => void;
}

export const GameOverlayHUD: React.FC<GameOverlayHUDProps> = ({
  gamePhase,
  telemetry,
  inputRef,
  controllerRef,
  isMuted,
  onToggleMute,
  onStartGame,
  onTogglePause,
  onDismissVictory,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState<
    'modes' | 'missions' | 'weather' | 'teleport'
  >('modes');

  // Virtual thumb joystick state for iPad Safari
  const joyContainerRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const activePointerIdRef = useRef<number | null>(null);

  const handleJoystickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    activePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoystickFromEvent(e);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    updateJoystickFromEvent(e);
  };

  const handleJoystickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    inputRef.current.steer = 0;
    inputRef.current.pitch = 0;
    inputRef.current.throttle = 0;
  };

  const updateJoystickFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = joyContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.42;

    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);

    const nx = dist > 4 ? (Math.cos(angle) * clampedDist) / maxR : 0;
    const ny = dist > 4 ? (Math.sin(angle) * clampedDist) / maxR : 0;

    setJoyKnob({ x: nx * maxR, y: ny * maxR });
    inputRef.current.steer = Number(nx.toFixed(2));

    if (telemetry.mode === VehicleMode.BIKE) {
      inputRef.current.throttle = Number((-ny).toFixed(2));
      inputRef.current.pitch = 0;
    } else {
      // In Plane or Submarine mode, pushing joystick forward/back pitches and throttles
      inputRef.current.pitch = Number((-ny).toFixed(2));
      inputRef.current.throttle = Math.abs(ny) > 0.15 ? 1 : 0.7;
    }
  };

  const currentMission =
    MISSIONS[telemetry.activeMissionIndex] || MISSIONS[0];

  const renderWeatherIcon = (w: WeatherType) => {
    switch (w) {
      case WeatherType.RAIN:
        return <CloudRain className="w-4 h-4 text-sky-400" />;
      case WeatherType.FOG:
        return <CloudFog className="w-4 h-4 text-slate-300" />;
      case WeatherType.STORM:
        return <CloudLightning className="w-4 h-4 text-amber-400" />;
      default:
        return <Sun className="w-4 h-4 text-amber-400" />;
    }
  };

  // ===========================================================================
  // 1. TITLE SCREEN OVERLAY (Full-Viewport Game Shell)
  // ===========================================================================
  if (gamePhase === GamePhase.TITLE) {
    return (
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-12 pointer-events-none">
        {/* Top minimal header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs tracking-wider text-slate-300 bg-slate-950/85 border border-slate-800 px-3.5 py-2 rounded-lg pointer-events-auto">
            <span className="font-semibold text-white">APEX NOMAD X-3</span>
            <span aria-hidden="true">·</span>
            <span>Open-World Tri-Shift Sandbox</span>
            <span aria-hidden="true">·</span>
            <span>iPad & Desktop Ready</span>
          </div>

          <button
            onClick={onToggleMute}
            className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-950/85 border border-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
            <span>{isMuted ? 'Audio Muted' : 'Audio Active'}</span>
          </button>
        </div>

        {/* Center-Left Hero Lockup over 40% negative space */}
        <div className="max-w-xl my-auto pointer-events-auto bg-slate-950/88 border border-slate-800/90 p-6 md:p-8 rounded-2xl shadow-2xl">
          {/* Bespoke inline SVG Title emblem */}
          <div className="flex items-center gap-3 mb-3">
            <svg
              viewBox="0 0 48 48"
              className="w-10 h-10 shrink-0"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon
                points="24,4 44,18 36,42 12,42 4,18"
                stroke="#f97316"
                strokeWidth="2.5"
                fill="rgba(249,115,22,0.12)"
              />
              <path
                d="M10 24L24 14L38 24M16 32H32M24 14V36"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="text-xs font-medium text-amber-400 tracking-wide">
              LAND · SKY · ABYSSAL TRENCH
            </div>
          </div>

          <h1
            className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3"
            style={{ textWrap: 'balance' }}
          >
            APEX NOMAD: TRI-SHIFT ODYSSEY
          </h1>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6">
            Blast down the 3km Mirage Straightaway on your off-road motorbike,
            ignite twin plasma rocket boosters, unfold swept delta wings to soar
            through canyon arches, or seal the submarine canopy to explore the
            Lost Underwater City of Aethelgard.
          </p>

          <div className="grid grid-cols-3 gap-2.5 mb-6 text-xs text-slate-300">
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="font-semibold text-amber-400 mb-0.5">
                01. Motorbike
              </div>
              <div className="text-slate-400">
                Off-road suspension, highway speed traps & mega-ramps
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="font-semibold text-sky-400 mb-0.5">
                02. Jet Plane
              </div>
              <div className="text-slate-400">
                Swept delta airfoil, canyon slaloms & storm crosswinds
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="font-semibold text-teal-400 mb-0.5">
                03. Submarine
              </div>
              <div className="text-slate-400">
                Deep-sea sonar, hydro-thrusters & Sunken Citadel relics
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onStartGame}
              className="px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base tracking-wide transition-transform active:scale-95 cursor-pointer"
            >
              Launch Expedition
            </button>
            <div className="text-xs text-slate-400">
              Press <span className="text-slate-200 font-semibold">Enter</span>{' '}
              or <span className="text-slate-200 font-semibold">Space</span> to
              start
            </div>
          </div>
        </div>

        {/* Single flat control-hint line at bottom */}
        <div className="text-xs text-slate-300 bg-slate-950/85 border border-slate-800 px-4 py-2.5 rounded-xl self-start pointer-events-auto">
          WASD / Touch Joystick Move · Shift / Boost Button Rocket Thrusters ·
          1/2/3 or E Transform Mode · Space Jump / Ascend · Esc Pause
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2. ACTIVE GAMEPLAY HUD + IPAD TOUCH CONTROLS + COLLAPSIBLE BOTTOM DOCK
  // ===========================================================================
  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5 select-none">
      {/* TOP PERIMETER CLUSTER: Telemetry + Mission Objective + Weather + Utility */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Top-Left: Speedometer, Altitude/Depth, Rocket Booster Bar */}
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-5 shadow-lg">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">SPEED</div>
            <div className="flex items-baseline gap-1">
              <span className="font-display font-bold text-2xl md:text-3xl text-white font-mono-tabular">
                {telemetry.speedKmh}
              </span>
              <span className="text-xs text-slate-400">km/h</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div>
            <div className="text-[11px] text-slate-400 font-medium">
              {telemetry.isUnderwater ? 'DEPTH' : 'ALTITUDE'}
            </div>
            <div className="font-mono-tabular text-lg font-bold text-sky-400">
              {telemetry.isUnderwater
                ? `-${telemetry.depthM} m`
                : `${telemetry.altitudeM} m`}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {/* Rocket Booster Fuel & Thermal Status */}
          <div className="w-32 md:w-36">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                BOOST
              </span>
              <span
                className={`font-mono-tabular font-semibold ${
                  telemetry.boostOverheated
                    ? 'text-red-400'
                    : telemetry.isBoosting
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}
              >
                {telemetry.boostOverheated
                  ? `COOL ${telemetry.boostCooldownSec}s`
                  : `${telemetry.boostFuel}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-transform duration-75 origin-left ${
                  telemetry.boostOverheated
                    ? 'bg-red-500'
                    : telemetry.isBoosting
                    ? 'bg-amber-400'
                    : 'bg-sky-400'
                }`}
                style={{
                  transform: `scaleX(${Math.max(
                    0.02,
                    telemetry.boostFuel / 100
                  )})`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Top-Center: Active Mission Tracker & Live Waypoint Compass */}
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 max-w-md flex-1 min-w-[260px] shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 truncate">
              <Target className="w-3.5 h-3.5 shrink-0" />
              <span>
                {currentMission.code}: {currentMission.title}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono-tabular shrink-0">
              {telemetry.completedMissionIds.length}/{MISSIONS.length} Ops
            </span>
          </div>

          <p className="text-xs text-slate-300 line-clamp-1 mb-1.5">
            {currentMission.description}
          </p>

          <div className="flex items-center justify-between text-[11px] text-slate-300 gap-3">
            <span className="font-mono-tabular truncate text-sky-300">
              {telemetry.missionProgressText}
            </span>
            {telemetry.nextWaypointDistanceM !== null && (
              <span className="flex items-center gap-1 font-mono-tabular text-amber-300 shrink-0">
                <Navigation
                  className="w-3 h-3 inline-block"
                  style={{
                    transform: `rotate(${
                      telemetry.nextWaypointBearingDeg || 0
                    }deg)`,
                  }}
                />
                {telemetry.nextWaypointDistanceM}m
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Weather Status, Score, Relics & Pause/Audio Actions */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2.5 shadow-lg">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
            {renderWeatherIcon(telemetry.weather)}
            <div className="text-xs">
              <div className="font-semibold text-slate-200 leading-none">
                {telemetry.weather}
              </div>
              <div className="text-[10px] text-slate-400 font-mono-tabular mt-0.5">
                Grip {Math.round(telemetry.tractionMultiplier * 100)}%
              </div>
            </div>
          </div>

          <div className="text-xs pr-2 border-r border-slate-800">
            <div className="text-[10px] text-slate-400">SCORE · RELICS</div>
            <div className="font-mono-tabular font-semibold text-white">
              {telemetry.score} · {telemetry.collectedCount}/
              {telemetry.totalCollectibles}
            </div>
          </div>

          <button
            onClick={() => controllerRef.current?.cycleCameraPreset()}
            title="Cycle Camera View (C)"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={() => controllerRef.current?.resetVehicle()}
            title="Stabilize Vehicle (R)"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMute}
            title="Toggle Audio (M)"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
          </button>

          <button
            onClick={onTogglePause}
            title="Pause Game (Esc)"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            {gamePhase === GamePhase.PAUSED ? (
              <Play className="w-4 h-4 text-amber-400" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* DYNAMIC EVENT / CHECKPOINT NOTIFICATION BANNER */}
      {telemetry.notification && (
        <div className="self-center mt-2 bg-slate-950/92 border border-amber-500/50 text-amber-300 px-4 py-2 rounded-xl text-xs md:text-sm font-medium tracking-wide shadow-lg">
          {telemetry.notification}
        </div>
      )}

      {/* MIDDLE VIEWPORT: 100% Unobstructed 3D Playfield */}
      <div className="flex-1" />

      {/* BOTTOM ROW: Left Touch Joystick + Center Collapsible Dock + Right Touch Pedals */}
      <div className="flex items-end justify-between gap-3 w-full">
        {/* LEFT THUMB VIRTUAL JOYSTICK (iPad Safari & Touch Ergonomics) */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 shrink-0">
          <div
            ref={joyContainerRef}
            onPointerDown={handleJoystickDown}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickUp}
            onPointerCancel={handleJoystickUp}
            className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-slate-950/85 border-2 border-slate-700/90 relative flex items-center justify-center touch-none cursor-grab active:cursor-grabbing shadow-xl"
          >
            {/* Crosshair lines */}
            <div className="w-full h-px bg-slate-800 absolute pointer-events-none" />
            <div className="h-full w-px bg-slate-800 absolute pointer-events-none" />
            <div
              className="w-11 h-11 rounded-full bg-amber-500/90 border-2 border-white shadow-md pointer-events-none"
              style={{
                transform: `translate3d(${joyKnob.x}px, ${joyKnob.y}px, 0)`,
              }}
            />
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {telemetry.mode === VehicleMode.BIKE
              ? 'STEER & DRIVE'
              : 'STEER & PITCH'}
          </span>
        </div>

        {/* CENTER COLLAPSIBLE CONTROL DOCK (Three.js Skill Section 5 Contract) */}
        <div className="pointer-events-auto flex flex-col items-center max-w-[min(780px,62vw)] w-full mx-auto">
          {/* Collapse / Expand Toggle Tab */}
          <button
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-slate-950/90 border border-b-0 border-slate-800 text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Show Tri-Shift Dock (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {telemetry.zoneName} · City {telemetry.distanceToCityM}m
                </span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="w-full bg-slate-950/92 border border-slate-800 rounded-xl p-2.5 shadow-2xl">
              {/* Dock Category Tabs */}
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/80 overflow-x-auto">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['modes', 'Vehicle Form'],
                      ['missions', 'Operations (6)'],
                      ['weather', 'Weather System'],
                      ['teleport', 'Fast Travel'],
                    ] as const
                  ).map(([tabKey, label]) => (
                    <button
                      key={tabKey}
                      onClick={() => setActiveDockTab(tabKey)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        activeDockTab === tabKey
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono-tabular shrink-0">
                  <Compass className="w-3.5 h-3.5 text-sky-400" />
                  <span>HDG {telemetry.headingDeg}°</span>
                  <span aria-hidden="true">·</span>
                  <span>TOP {telemetry.topSpeedKmh} km/h</span>
                </div>
              </div>

              {/* Tab 1: TRI-SHIFT VEHICLE MODE SELECTOR */}
              {activeDockTab === 'modes' && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      controllerRef.current?.setMode(VehicleMode.BIKE)
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                      telemetry.mode === VehicleMode.BIKE
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>1 · MOTORBIKE</span>
                    <span className="text-[10px] opacity-80 font-normal">
                      Highway & Off-Road
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      controllerRef.current?.setMode(VehicleMode.PLANE)
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                      telemetry.mode === VehicleMode.PLANE
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>2 · JET PLANE</span>
                    <span className="text-[10px] opacity-80 font-normal">
                      Swept Delta Wings
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      controllerRef.current?.setMode(VehicleMode.SUB)
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                      telemetry.mode === VehicleMode.SUB
                        ? 'bg-teal-400 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>3 · SUBMARINE</span>
                    <span className="text-[10px] opacity-80 font-normal">
                      Deep Trench & Sonar
                    </span>
                  </button>
                </div>
              )}

              {/* Tab 2: MISSION SELECTOR */}
              {activeDockTab === 'missions' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {MISSIONS.map((m, idx) => {
                    const isDone = telemetry.completedMissionIds.includes(m.id);
                    const isCurrent = telemetry.activeMissionIndex === idx;
                    return (
                      <button
                        key={m.id}
                        onClick={() => controllerRef.current?.selectMission(idx)}
                        className={`p-2 rounded-lg text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                          isCurrent
                            ? 'bg-amber-500/20 border border-amber-500 text-white'
                            : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-mono-tabular font-semibold text-amber-400 mr-1">
                            {m.code}
                          </span>
                          <span className="truncate">{m.title}</span>
                        </div>
                        {isDone && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: DYNAMIC WEATHER CONTROLS */}
              {activeDockTab === 'weather' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        [WeatherType.CLEAR, 'Clear Sun (100% Grip)'],
                        [WeatherType.RAIN, 'Monsoon Rain (76% Grip)'],
                        [WeatherType.FOG, 'Canyon Fog (Low Vis)'],
                        [WeatherType.STORM, 'Thunder Storm (Crosswind)'],
                      ] as const
                    ).map(([wType, label]) => (
                      <button
                        key={wType}
                        onClick={() =>
                          controllerRef.current?.setWeather(wType, true)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          telemetry.weather === wType
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => controllerRef.current?.toggleWeatherAuto()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                      telemetry.weatherAutoCycle
                        ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    Auto-Cycle:{' '}
                    {telemetry.weatherAutoCycle
                      ? `ON (${telemetry.weatherTimerSec}s)`
                      : 'OFF'}
                  </button>
                </div>
              )}

              {/* Tab 4: FAST TRAVEL TELEPORTS */}
              {activeDockTab === 'teleport' && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {TELEPORT_POINTS.map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => controllerRef.current?.teleportTo(pt)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-white truncate">
                        {pt.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {pt.zone}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT THUMB ACTION CLUSTER (Rocket Boost, Throttle, Climb/Dive for iPad Safari) */}
        <div className="pointer-events-auto flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {/* Dive / Brake button */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                if (telemetry.mode === VehicleMode.BIKE) {
                  inputRef.current.throttle = -1;
                } else {
                  inputRef.current.dive = true;
                }
              }}
              onPointerUp={() => {
                if (telemetry.mode === VehicleMode.BIKE) {
                  inputRef.current.throttle = 0;
                } else {
                  inputRef.current.dive = false;
                }
              }}
              onPointerLeave={() => {
                inputRef.current.dive = false;
                if (inputRef.current.throttle < 0)
                  inputRef.current.throttle = 0;
              }}
              className="px-3.5 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-semibold text-slate-200 active:bg-slate-800 touch-none cursor-pointer whitespace-nowrap"
            >
              {telemetry.mode === VehicleMode.BIKE ? 'BRAKE / REV' : 'DIVE DOWN'}
            </button>

            {/* Jump / Pull Up / Surface button */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.jumpOrAscend = true;
              }}
              onPointerUp={() => {
                inputRef.current.jumpOrAscend = false;
              }}
              onPointerLeave={() => {
                inputRef.current.jumpOrAscend = false;
              }}
              className="px-3.5 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-semibold text-sky-300 active:bg-slate-800 touch-none cursor-pointer whitespace-nowrap"
            >
              {telemetry.mode === VehicleMode.BIKE
                ? 'JUMP HOP'
                : telemetry.mode === VehicleMode.PLANE
                ? 'PULL UP'
                : 'SURFACE'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Throttle Hold Button */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.throttle = 1;
              }}
              onPointerUp={() => {
                inputRef.current.throttle = 0;
              }}
              onPointerLeave={() => {
                inputRef.current.throttle = 0;
              }}
              className="w-20 h-16 rounded-2xl bg-slate-900/95 border-2 border-slate-700 text-xs font-display font-bold text-white active:bg-slate-800 touch-none cursor-pointer flex flex-col items-center justify-center"
            >
              <span>THROTTLE</span>
              <span className="text-[10px] text-slate-400 font-normal">
                HOLD
              </span>
            </button>

            {/* Primary ROCKET BOOST Touch Button */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.boost = true;
              }}
              onPointerUp={() => {
                inputRef.current.boost = false;
              }}
              onPointerLeave={() => {
                inputRef.current.boost = false;
              }}
              disabled={telemetry.boostOverheated}
              className={`w-24 h-16 rounded-2xl font-display font-bold text-xs touch-none cursor-pointer flex flex-col items-center justify-center border-2 transition-transform active:scale-95 ${
                telemetry.boostOverheated
                  ? 'bg-red-950/90 border-red-700 text-red-300'
                  : telemetry.isBoosting
                  ? 'bg-amber-400 border-white text-slate-950'
                  : 'bg-amber-500/95 border-amber-300 text-slate-950'
              }`}
            >
              <Flame className="w-5 h-5 mb-0.5" />
              <span>
                {telemetry.boostOverheated ? 'OVERHEAT' : 'ROCKET BOOST'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. PAUSE / VICTORY MODAL OVERLAY
      ===================================================================== */}
      {(gamePhase === GamePhase.PAUSED || gamePhase === GamePhase.VICTORY) && (
        <div className="fixed inset-0 z-30 bg-slate-950/85 flex items-center justify-center p-6 pointer-events-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              {gamePhase === GamePhase.VICTORY
                ? 'ALL 6 OPERATIONS COMPLETE!'
                : 'EXPEDITION PAUSED'}
            </h2>
            <p className="text-sm text-slate-300 mb-6">
              {gamePhase === GamePhase.VICTORY
                ? 'You have mastered the Mirage Straightaway, Redrock Airspace, and the Lost Underwater City of Aethelgard. Continue exploring in Free Roam or replay any operation.'
                : 'Select a vehicle mode, teleport to a landmark, or resume your expedition.'}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 text-xs">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                <div className="text-slate-400">Total Score</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-400">
                  {telemetry.score} PTS
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                <div className="text-slate-400">Top Speed Recorded</div>
                <div className="font-mono-tabular text-lg font-bold text-sky-400">
                  {telemetry.topSpeedKmh} km/h
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                <div className="text-slate-400">Rings & Relics</div>
                <div className="font-mono-tabular text-lg font-bold text-teal-400">
                  {telemetry.collectedCount} / {telemetry.totalCollectibles}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                <div className="text-slate-400">Total Airtime</div>
                <div className="font-mono-tabular text-lg font-bold text-white">
                  {telemetry.airtimeSeconds} s
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={
                  gamePhase === GamePhase.VICTORY
                    ? onDismissVictory
                    : onTogglePause
                }
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
              >
                {gamePhase === GamePhase.VICTORY
                  ? 'Continue Free Roam'
                  : 'Resume Expedition'}
              </button>
              <button
                onClick={() => {
                  controllerRef.current?.resetVehicle();
                  if (gamePhase === GamePhase.VICTORY) onDismissVictory();
                  else onTogglePause();
                }}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium cursor-pointer"
              >
                Reset Bike
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
