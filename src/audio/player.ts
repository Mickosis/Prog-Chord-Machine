import type * as ToneNS from 'tone';
import type { Tuning } from '../tuning/tuning';
import type { Frets } from '../voicing/solver';

const STRUM_MS = 28;
/** Beats 2–4 strum faster and quieter than the accented downbeat. */
const OFFBEAT_STRUM_MS = 14;
const OFFBEAT_DB = -7;
export const BEATS_PER_BAR = 4;

// Tone.js is loaded on first play so the initial page stays small.
let tone: typeof ToneNS | undefined;
let synths: ToneNS.PluckSynth[] = [];
let clickSynth: ToneNS.Synth | undefined;
let current: { onStep: (index: number | null) => void } | null = null;

async function ensureSynths(count: number): Promise<{ Tone: typeof ToneNS; synths: ToneNS.PluckSynth[] }> {
  tone ??= await import('tone');
  await tone.start();
  while (synths.length < count) {
    synths.push(
      new tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.96, release: 1.2 }).toDestination(),
    );
  }
  clickSynth ??= new tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    volume: -14,
  }).toDestination();
  return { Tone: tone, synths };
}

function strumAt(Tone: typeof ToneNS, tuning: Tuning, frets: Frets, time: number, accent: boolean): void {
  const gap = (accent ? STRUM_MS : OFFBEAT_STRUM_MS) / 1000;
  let k = 0;
  frets.forEach((f, i) => {
    if (f === null) return;
    const synth = synths[i];
    synth.volume.setValueAtTime(accent ? 0 : OFFBEAT_DB, time);
    synth.triggerAttack(Tone.Frequency(tuning.strings[i] + f, 'midi').toFrequency(), time + k++ * gap);
  });
}

/** Strum one chord now (chord audition). */
export async function strum(tuning: Tuning, frets: Frets): Promise<void> {
  const { Tone } = await ensureSynths(tuning.strings.length);
  strumAt(Tone, tuning, frets, Tone.now(), true);
}

/** Stop any running sequence; its onStep gets null so the UI can reset. */
export function stopPlayback(): void {
  if (tone) {
    const transport = tone.getTransport();
    transport.stop();
    transport.cancel();
  }
  const c = current;
  current = null;
  c?.onStep(null);
}

export interface PlayOptions {
  bpm: number;
  /** Start over at the end until stopped. */
  loop: boolean;
  /** Metronome click on every beat, higher on beat 1. */
  click: boolean;
}

/**
 * Play voicings one per 4/4 bar, strummed on every beat with the downbeat
 * accented. onStep gets the bar index as it sounds, then null when playback ends.
 */
export async function playSequence(
  tuning: Tuning,
  voicings: Frets[],
  opts: PlayOptions,
  onStep: (index: number | null) => void,
): Promise<void> {
  stopPlayback();
  if (voicings.length === 0) return;
  const me = { onStep };
  current = me;
  const { Tone } = await ensureSynths(tuning.strings.length);
  if (current !== me) return; // stopped or replaced while loading

  const transport = Tone.getTransport();
  const draw = Tone.getDraw();
  transport.bpm.value = opts.bpm;
  const total = voicings.length * BEATS_PER_BAR;
  let beat = 0;

  transport.scheduleRepeat((time) => {
    if (beat === total) {
      if (!opts.loop) {
        draw.schedule(() => {
          if (current === me) stopPlayback();
        }, time);
        return;
      }
      beat = 0;
    }
    const bar = Math.floor(beat / BEATS_PER_BAR);
    const downbeat = beat % BEATS_PER_BAR === 0;
    strumAt(Tone, tuning, voicings[bar], time, downbeat);
    if (opts.click) clickSynth?.triggerAttackRelease(downbeat ? 'C6' : 'G5', 0.03, time);
    if (downbeat) draw.schedule(() => current === me && onStep(bar), time);
    beat++;
  }, '4n');
  transport.start('+0.05');
}
