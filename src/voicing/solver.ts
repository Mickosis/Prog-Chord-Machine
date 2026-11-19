import { chordPcs, type Chord } from '../theory/chords';
import { mod12 } from '../theory/notes';
import { stringNumber, type Tuning } from '../tuning/tuning';

export type ShapeFamily =
  | 'rootLow'
  | 'root6'
  | 'root5'
  | 'root4'
  | 'allStrings'
  | 'open'
  | 'topStrings'
  | 'power'
  | 'spread';

export const FAMILY_LABELS: Record<ShapeFamily, string> = {
  rootLow: 'Root on lowest string',
  root6: 'Root on 6th (7-str)',
  root5: 'Root on 5th',
  root4: 'Root on 4th',
  allStrings: 'All strings',
  open: 'Open strings',
  topStrings: 'Top-string voicings',
  power: 'Power (embellished)',
  spread: 'Spread',
};

export const ALL_FAMILIES = Object.keys(FAMILY_LABELS) as ShapeFamily[];

/** Fret per string, lowest string first. null = muted. */
export type Frets = (number | null)[];

export interface Voicing {
  frets: Frets;
  fingers: number;
  families: ShapeFamily[];
  /** Lowest string played open. */
  usesOpenLow: boolean;
  /** Open strings above the bass (any position). */
  openUpper: number;
  /** Open strings ringing above the highest fretted string, weighted toward the top two strings. */
  openRing: number;
  pitches: number[];
}

/** Shapes are dyads and triads: 2–3 strings sounded (a ringing open string counts). */
export const MIN_NOTES = 2;
export const MAX_NOTES = 3;

/** Notes a shape may sound: 3, or more when the player extended the chord. */
export const maxNotes = (chord: Chord): number => Math.max(MAX_NOTES, new Set(chordPcs(chord)).size);

export interface SolveOptions {
  maxStretch: number; // frets covered by the hand, e.g. 4
  maxFret?: number;
}

/**
 * Count fretting fingers. A barre at the lowest fretted position counts as one
 * finger when every string under it is fretted at or above that fret.
 */
export function countFingers(frets: Frets): number {
  const fretted = frets
    .map((f, i) => ({ f, i }))
    .filter((x): x is { f: number; i: number } => x.f !== null && x.f > 0);
  if (fretted.length === 0) return 0;
  const minF = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === minF);
  if (atMin.length >= 2) {
    const lo = atMin[0].i;
    const hi = atMin[atMin.length - 1].i;
    let barreOk = true;
    for (let i = lo; i <= hi; i++) {
      const f = frets[i];
      if (f === null || f < minF) barreOk = false;
    }
    if (barreOk) return 1 + fretted.length - atMin.length;
  }
  return fretted.length;
}

export function classify(frets: Frets, tuning: Tuning, chord: Chord): ShapeFamily[] {
  const n = frets.length;
  const sounded = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  const lo = sounded[0];
  const hi = sounded[sounded.length - 1];
  const pitches = sounded.map((i) => tuning.strings[i] + (frets[i] as number));
  const internalMutes = hi - lo + 1 - sounded.length;
  const fams: ShapeFamily[] = [];
  const sn = stringNumber(tuning, lo);

  if (lo === 0) fams.push('rootLow');
  else if (sn === 6 && n >= 7) fams.push('root6');
  if (sn === 5 && lo !== 0) fams.push('root5');
  if (sn === 4 && lo !== 0) fams.push('root4');
  if (sounded.length === n) fams.push('allStrings');
  if (sounded.some((i) => i > 0 && frets[i] === 0)) fams.push('open');
  if (lo >= n - 4 && sounded.length <= 4) fams.push('topStrings');

  const bass = chord.bass ?? chord.root;
  const pcs = new Set(pitches.map(mod12));
  if (
    hi <= 3 &&
    sounded.length >= 3 &&
    sounded.length <= 4 &&
    internalMutes === 0 &&
    pcs.has(mod12(bass + 7))
  ) {
    fams.push('power');
  }
  const range = Math.max(...pitches) - Math.min(...pitches);
  if (internalMutes > 0 || (range >= 20 && sounded.length <= 5)) fams.push('spread');
  return fams;
}

const cache = new Map<string, Voicing[]>();

export function solveVoicings(tuning: Tuning, chord: Chord, opts: SolveOptions): Voicing[] {
  const maxFret = opts.maxFret ?? 15;
  const bass = chord.bass ?? chord.root;
  const cacheKey = [
    tuning.strings.join('.'),
    chord.root,
    chord.quality,
    (chord.adds ?? []).join(','),
    bass,
    opts.maxStretch,
    maxFret,
  ].join('|');
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  // Every chord tone (and the bass) must sound; nothing else may.
  const required = new Set([...chordPcs(chord), bass]);
  const most = Math.max(maxNotes(chord), required.size);

  const n = tuning.strings.length;
  const options: (number | null)[][] = tuning.strings.map((open) => {
    const opts2: (number | null)[] = [null];
    for (let f = 0; f <= maxFret; f++) if (required.has(mod12(open + f))) opts2.push(f);
    return opts2;
  });

  const out: Voicing[] = [];
  const frets: Frets = new Array(n).fill(null);
  const span = opts.maxStretch - 1;

  const dfs = (
    i: number,
    minF: number,
    maxF: number,
    count: number,
    firstSounded: number,
    mutesInside: number,
    pendingMutes: number,
  ) => {
    if (i === n) {
      finish();
      return;
    }
    for (const f of options[i]) {
      if (f === null) {
        frets[i] = null;
        // A mute after sounding counts as "pending" — becomes internal if another string sounds later.
        dfs(i + 1, minF, maxF, count, firstSounded, mutesInside, firstSounded >= 0 ? pendingMutes + 1 : 0);
        continue;
      }
      if (count >= most) continue;
      const newInside = firstSounded >= 0 ? mutesInside + pendingMutes : mutesInside;
      if (newInside > 1) continue;
      let nMin = minF;
      let nMax = maxF;
      if (f > 0) {
        nMin = Math.min(minF, f);
        nMax = Math.max(maxF, f);
        if (nMax - nMin > span) continue;
      }
      frets[i] = f;
      dfs(i + 1, nMin, nMax, count + 1, firstSounded >= 0 ? firstSounded : i, newInside, 0);
    }
    frets[i] = null;
  };

  const finish = () => {
    const sounded: number[] = [];
    for (let s = 0; s < n; s++) if (frets[s] !== null) sounded.push(s);
    if (sounded.length < MIN_NOTES) return;
    const pitches = sounded.map((s) => tuning.strings[s] + (frets[s] as number));
    // The lowest sounded string must carry the bass and be the lowest pitch.
    if (mod12(pitches[0]) !== bass || Math.min(...pitches) < pitches[0]) return;
    const pcs = new Set(pitches.map(mod12));
    for (const r of required) if (!pcs.has(r)) return;
    const fingers = countFingers(frets);
    const fretted = frets.filter((f) => f !== null && f > 0).length;
    // No bare one-finger barre (the default drop-tuning power chord).
    if (fingers === 1 && fretted >= 2) return;
    const snapshot = frets.slice();
    out.push({
      frets: snapshot,
      fingers,
      families: classify(snapshot, tuning, chord),
      usesOpenLow: snapshot[0] === 0,
      openUpper: sounded.filter((s) => s > sounded[0] && snapshot[s] === 0).length,
      openRing: openRing(snapshot),
      pitches: pitches.sort((a, b) => a - b),
    });
  };

  dfs(0, Infinity, -Infinity, 0, -1, 0, 0);
  cache.set(cacheKey, out);
  return out;
}

/**
 * Open strings ringing above every fretted note. The top two strings count
 * double: open treble strings over a fretted shape is the sound we want most.
 */
export function openRing(frets: Frets): number {
  const n = frets.length;
  let topFretted = -1;
  frets.forEach((f, i) => {
    if (f !== null && f > 0) topFretted = i;
  });
  if (topFretted < 0) return 0;
  let w = 0;
  for (let i = topFretted + 1; i < n; i++) if (frets[i] === 0) w += i >= n - 2 ? 2 : 1;
  return w;
}

export const voicingKey = (tuning: Tuning, frets: Frets): string =>
  `${tuning.strings.join('.')}:${frets.map((f) => (f === null ? 'x' : f)).join('-')}`;

export const fretsLabel = (frets: Frets): string =>
  frets.map((f) => (f === null ? 'x' : String(f))).join('-');
