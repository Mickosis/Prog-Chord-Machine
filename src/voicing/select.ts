import type { Chord } from '../theory/chords';
import type { Rng } from '../generator/rng';
import type { Tuning } from '../tuning/tuning';
import { solveVoicings, voicingKey, type Frets, type ShapeFamily, type Voicing } from './solver';

export type OpenFreq = 'off' | 'rarely' | 'sometimes' | 'often';

export const OPEN_FREQ_WEIGHT: Record<OpenFreq, number> = {
  off: 0,
  rarely: 0.12,
  sometimes: 0.5,
  often: 1.6,
};

/** How many times each voicing / family has been shown (drives novelty). */
export interface Exposure {
  voicings: Record<string, number>;
  families: Partial<Record<ShapeFamily, number>>;
}

export const emptyExposure = (): Exposure => ({ voicings: {}, families: {} });

export interface VoicingPrefs {
  openFreq: OpenFreq;
  maxStretch: number;
  /** 0 = ignore history, 1 = push hard toward unseen shapes. */
  novelty: number;
  /** Keep the bass on this guitar string (1 = highest) when possible. */
  anchorString?: number;
  /** Previous chord's shape: nearby hand positions score higher. */
  prevFrets?: Frets;
  /** How strongly open top strings ringing over fretted shapes are favoured (0 = neutral). */
  openHigh?: number;
  /** Chug chord: bass on the open low string. */
  chug?: boolean;
}

/** Index of the lowest sounded string, or -1 when every string is muted. */
export const bassString = (frets: Frets): number => frets.findIndex((f) => f !== null);

/** Where the fretting hand sits: average fretted fret (0 for all-open shapes). */
export function handPosition(frets: Frets): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
}

/** Frets the hand moves between two shapes. */
export const handDistance = (a: Frets, b: Frets): number => Math.abs(handPosition(a) - handPosition(b));

export const PROXIMITY_WEIGHT = 0.6;

/** Anchor as a string index from the low side, or undefined when unanchored. */
export function anchorIndex(tuning: Tuning, prefs: VoicingPrefs): number | undefined {
  if (prefs.anchorString === undefined) return undefined;
  const i = tuning.strings.length - prefs.anchorString;
  return i >= 0 && i < tuning.strings.length ? i : undefined;
}

/** True when the shape's bass sits on the anchor string (or there is no anchor). */
export const isOnAnchor = (tuning: Tuning, prefs: VoicingPrefs, frets: Frets): boolean => {
  const a = anchorIndex(tuning, prefs);
  return a === undefined || bassString(frets) === a;
};

/** Below this pitch (C3) close intervals turn to mud under distortion. */
const MUD_LINE = 48;

/**
 * Penalty for intervals that sound muddy with a distorted tone: a 3rd or less
 * between adjacent low notes. The bass should move in 5ths and octaves; colour goes on top.
 */
export function mudFactor(pitches: number[]): number {
  let f = 1;
  for (let i = 1; i < pitches.length; i++) {
    const lo = pitches[i - 1];
    const gap = pitches[i] - lo;
    if (gap === 0) continue;
    if (gap <= 2 && lo < MUD_LINE) f *= 0.3;
    else if (gap <= 4 && lo < MUD_LINE - 3) f *= 0.5;
    else if (gap <= 4 && lo < MUD_LINE) f *= 0.75;
  }
  return f;
}

export function scoreVoicing(v: Voicing, tuning: Tuning, prefs: VoicingPrefs, exposure: Exposure): number {
  let s = 1;
  if (!prefs.chug && v.usesOpenLow) s *= OPEN_FREQ_WEIGHT[prefs.openFreq];
  s *= mudFactor(v.pitches);
  // Open top strings ringing over a fretted shape; more so with the hand up the neck.
  const openHigh = prefs.openHigh ?? 0;
  if (openHigh > 0 && v.openRing > 0) {
    const upNeck = handPosition(v.frets) >= 5 ? 1.3 : 1;
    s *= 1 + openHigh * Math.min(v.openRing, 3) * upNeck;
  } else if (openHigh > 0 && v.openUpper > 0) {
    s *= 1 + openHigh * 0.3;
  }
  const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
  if (fretted.length && Math.min(...fretted) <= 4 && Math.max(...fretted) - Math.min(...fretted) >= 3) s *= 0.7;
  const maxF = Math.max(...v.frets.map((f) => f ?? 0));
  if (maxF > 12) s *= 0.6;
  const seen = exposure.voicings[voicingKey(tuning, v.frets)] ?? 0;
  s /= 1 + prefs.novelty * 2 * seen;
  const famSeen = Math.min(...v.families.map((f) => exposure.families[f] ?? 0));
  s /= 1 + prefs.novelty * 0.1 * (Number.isFinite(famSeen) ? famSeen : 0);
  if (prefs.prevFrets && prefs.prevFrets.some((f) => f !== null)) {
    s /= 1 + PROXIMITY_WEIGHT * handDistance(v.frets, prefs.prevFrets);
  }
  return s;
}

/**
 * Candidate voicings for a chord, best first. Open upper strings are always
 * allowed; the open low string follows openFreq. With an anchor string, shapes with the bass on it come first.
 */
export function rankVoicings(
  tuning: Tuning,
  chord: Chord,
  prefs: VoicingPrefs,
  exposure: Exposure,
): Voicing[] {
  const all = solveVoicings(tuning, chord, {
    maxStretch: prefs.maxStretch,
  });
  let pool = all;
  if (prefs.chug) {
    const open = pool.filter((v) => v.usesOpenLow);
    if (open.length) pool = open;
  } else if (prefs.openFreq === 'off') pool = pool.filter((v) => !v.usesOpenLow);
  // Never leave the player empty-handed: fall back to any playable shape.
  if (pool.length === 0) pool = all;
  const anchor = anchorIndex(tuning, prefs);
  const onAnchor = (v: Voicing) => (anchor === undefined || bassString(v.frets) === anchor ? 1 : 0);
  return pool
    .map((v) => ({ v, a: onAnchor(v), s: scoreVoicing(v, tuning, prefs, exposure) }))
    .sort((a, b) => b.a - a.a || b.s - a.s)
    .map((x) => x.v);
}

/** Weighted pick among the top candidates (only anchor-string ones when there are any). */
export function pickVoicing(ranked: Voicing[], tuning: Tuning, prefs: VoicingPrefs, exposure: Exposure, rng: Rng): Voicing | undefined {
  const anchor = anchorIndex(tuning, prefs);
  const anchored = anchor === undefined ? ranked : ranked.filter((v) => bassString(v.frets) === anchor);
  const top = (anchored.length ? anchored : ranked).slice(0, 40);
  if (top.length === 0) return undefined;
  return rng.weighted(top, (v) => scoreVoicing(v, tuning, prefs, exposure));
}

/**
 * Shape for a chord that just gained (or lost) a note, staying where the hand
 * already is: same bass string, as many of the current strings untouched as
 * possible, then the closest hand position. Undefined when nothing is playable.
 */
export function stayInPosition(tuning: Tuning, chord: Chord, current: Frets, maxStretch: number): Frets | undefined {
  const all = solveVoicings(tuning, chord, { maxStretch });
  const bass = bassString(current);
  const kept = (f: Frets) => f.filter((x, s) => x !== null && x === current[s]).length;
  const changed = (f: Frets) => f.filter((x, s) => x !== current[s]).length;
  const ranked = all
    .map((v) => ({
      v,
      bass: bassString(v.frets) === bass ? 1 : 0,
      kept: kept(v.frets),
      changed: changed(v.frets),
      dist: handDistance(v.frets, current),
      mud: mudFactor(v.pitches),
    }))
    .sort((a, b) => b.bass - a.bass || b.kept - a.kept || a.changed - b.changed || a.dist - b.dist || b.mud - a.mud);
  return ranked[0]?.v.frets;
}
