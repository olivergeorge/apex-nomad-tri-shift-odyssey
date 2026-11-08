import { VehicleMode, WeatherType } from '../types/game';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private isStarted = false;

  // Continuous engine nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Continuous rocket booster / wind noise nodes
  private noiseNode: AudioBufferSourceNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;
  private boostGain: GainNode | null = null;

  private sonarTimer = 0;

  public init() {
    if (this.isStarted) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();

      // Main Engine Oscillators
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineGain = this.ctx.createGain();

      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';
      this.engineOsc1.frequency.value = 55;
      this.engineOsc2.frequency.value = 110;

      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineFilter.Q.value = 3.5;

      this.engineGain.gain.value = 0.0;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // White noise buffer for Rocket Boosters & Weather Wind
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(
        1,
        bufferSize,
        this.ctx.sampleRate
      );
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;

      this.boostFilter = this.ctx.createBiquadFilter();
      this.boostFilter.type = 'bandpass';
      this.boostFilter.frequency.value = 400;
      this.boostFilter.Q.value = 1.2;

      this.boostGain = this.ctx.createGain();
      this.boostGain.gain.value = 0.0;

      this.noiseNode.connect(this.boostFilter);
      this.boostFilter.connect(this.boostGain);
      this.boostGain.connect(this.ctx.destination);
      this.noiseNode.start();

      this.isStarted = true;
    } catch {
      // Ignore Web Audio restrictions until user gesture
    }
  }

  public resume() {
    if (!this.isStarted) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(
        muted ? 0 : 0.08,
        this.ctx.currentTime,
        0.05
      );
    }
    if (this.boostGain && this.ctx && muted) {
      this.boostGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public update(
    dt: number,
    speedKmh: number,
    mode: VehicleMode,
    isBoosting: boolean,
    isUnderwater: boolean,
    weather: WeatherType,
    isPlaying: boolean
  ) {
    if (!this.isStarted || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain || !this.boostFilter || !this.boostGain) {
      return;
    }

    if (this.isMuted || !isPlaying) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.boostGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }

    const now = this.ctx.currentTime;
    const speedNorm = Math.min(1, Math.abs(speedKmh) / 260);

    if (mode === VehicleMode.BIKE) {
      // Simulated 5-speed dirtbike gearbox cadence
      const gearRatio = (speedNorm * 4.2) % 1;
      const rpmFreq = 46 + speedNorm * 95 + gearRatio * 38 + (isBoosting ? 45 : 0);
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';
      this.engineOsc1.frequency.setTargetAtTime(rpmFreq, now, 0.04);
      this.engineOsc2.frequency.setTargetAtTime(rpmFreq * 1.5, now, 0.04);
      this.engineFilter.frequency.setTargetAtTime(
        260 + speedNorm * 900 + (isBoosting ? 600 : 0),
        now,
        0.05
      );
      this.engineGain.gain.setTargetAtTime(0.065 + speedNorm * 0.045, now, 0.05);
    } else if (mode === VehicleMode.PLANE) {
      // High-pitch turbine whine
      const jetFreq = 115 + speedNorm * 220 + (isBoosting ? 90 : 0);
      this.engineOsc1.type = 'sine';
      this.engineOsc2.type = 'sawtooth';
      this.engineOsc1.frequency.setTargetAtTime(jetFreq, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(jetFreq * 2.02, now, 0.06);
      this.engineFilter.frequency.setTargetAtTime(
        600 + speedNorm * 1400,
        now,
        0.06
      );
      this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.04, now, 0.06);
    } else {
      // Submarine deep hydro-propeller hum
      const subFreq = 36 + speedNorm * 58 + (isBoosting ? 30 : 0);
      this.engineOsc1.type = 'sine';
      this.engineOsc2.type = 'triangle';
      this.engineOsc1.frequency.setTargetAtTime(subFreq, now, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(subFreq * 1.98, now, 0.08);
      this.engineFilter.frequency.setTargetAtTime(
        180 + speedNorm * 260,
        now,
        0.08
      );
      this.engineGain.gain.setTargetAtTime(0.07 + speedNorm * 0.04, now, 0.08);
    }

    // Rocket Booster & Weather Wind noise
    const weatherNoise =
      weather === WeatherType.STORM
        ? 0.045
        : weather === WeatherType.RAIN
        ? 0.025
        : 0.008;
    const targetBoostGain = isBoosting
      ? 0.14
      : weatherNoise + speedNorm * 0.025;
    const targetBoostFreq = isBoosting
      ? isUnderwater
        ? 320
        : 780
      : weather === WeatherType.RAIN || weather === WeatherType.STORM
      ? 1100
      : 480;

    this.boostFilter.frequency.setTargetAtTime(targetBoostFreq, now, 0.06);
    this.boostGain.gain.setTargetAtTime(targetBoostGain, now, 0.06);

    // Periodic atmospheric sonar ping when underwater in Submarine mode
    if (isUnderwater && mode === VehicleMode.SUB) {
      this.sonarTimer += dt;
      if (this.sonarTimer > 4.8) {
        this.sonarTimer = 0;
        this.playSonarPing();
      }
    }
  }

  public playTransformSfx(targetMode: VehicleMode) {
    if (this.isMuted || !this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq =
      targetMode === VehicleMode.PLANE
        ? 280
        : targetMode === VehicleMode.SUB
        ? 160
        : 210;

    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.85, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.34);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playCollectSfx(isMissionStep = false) {
    if (this.isMuted || !this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;
    const notes = isMissionStep ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.12, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.3);
    });
  }

  public playBoostIgniteSfx() {
    if (this.isMuted || !this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.22);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  private playSonarPing() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.9);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.95);
  }

  public dispose() {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.noiseNode?.stop();
      this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}
