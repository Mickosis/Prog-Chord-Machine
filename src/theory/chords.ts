import { mod12, pcName, type PitchClass } from './notes';
import { degreePc, keyPrefersFlats, MODES, type Key } from './scales';

/** Dyads (2 notes) and triads (3 notes). Every note is required. */
export type QualityId = '5' | 'M3' | 'm3' | 'maj' | 'min' | 'sus2' | 'sus4' | 'dim' | 'aug';

export interface QualityDef {
  id: QualityId;
  symbol: string;
  /** Semitones above root (mod 12). */
  intervals: number[];
  minor: boolean; // lowercase numeral
}

const q = (id: QualityId, symbol: string, intervals: number[], minor: boolean): QualityDef => ({
  id,
  symbol,
  intervals,
  minor,
});

export const QUALITIES: Record<QualityId, QualityDef> = {
  '5': q('5', '5', [0, 7], false),
  M3: q('M3', '(no5)', [0, 4], false),
  m3: q('m3', 'm(no5)', [0, 3], true),
  maj: q('maj', '', [0, 4, 7], false),
  min: q('min', 'm', [0, 3, 7], true),
  sus2: q('sus2', 'sus2', [0, 2, 7], false),
  sus4: q('sus4', 'sus4', [0, 5, 7], false),
  dim: q('dim', '°', [0, 3, 6], true),
  aug: q('aug', '+', [0, 4, 8], false),
};

export const DYADS: QualityId[] = ['5', 'M3', 'm3'];

/** Map qualities from older saves (7ths, 9ths, add chords...) to the nearest dyad/triad. */
export function simplifyQuality(id: string): QualityId {
  if (id in QUALITIES) return id as QualityId;
  if (id === 'm7b5' || id === 'dim7') return 'dim';
  if (id === '7sus4') return 'sus4';
  if (id === 'maj7sus2') return 'sus2';
  if (/^m(?!aj)/.test(id)) return 'min';
  return 'maj';
}

export const QUALITY_IDS = Object.keys(QUALITIES) as QualityId[];

export type ChordSource =
  | 'diatonic'
  | 'borrowed'
  | 'mediant'
  | 'tritone'
  | 'polychord'
  | 'manual';

export interface Chord {
  root: PitchClass;
  quality: QualityId;
  /** Bass note if different from root (polychord). */
  bass?: PitchClass;
  source: ChordSource;
  /** Scale degree in the section key when meaningful (0-based). */
  degree?: number;
  /** Extra notes the player added (semitones above root): 7ths, 9ths, 11ths, 13ths. */
  adds?: number[];
}

/** Added notes that aren't already chord tones, low to high. */
export function chordAdds(chord: Chord): number[] {
  const own = QUALITIES[chord.quality].intervals;
  return [...new Set(chord.adds ?? [])].map(mod12).filter((i) => !own.includes(i)).sort((a, b) => a - b);
}

export function chordPcs(chord: Chord): PitchClass[] {
  return [...QUALITIES[chord.quality].intervals, ...chordAdds(chord)].map((i) => mod12(chord.root + i));
}

const TENSION: Record<number, string> = { 1: '♭9', 2: '9', 3: '♯9', 5: '11', 6: '♯11', 8: '♭13', 9: '13' };

/** Quality symbol with any added notes, e.g. "m7", "maj9", "sus4(add13)", "5(add9)". */
export function qualitySymbol(chord: Chord): string {
  const { quality } = chord;
  const def = QUALITIES[quality];
  const extra = chordAdds(chord);
  if (!extra.length) return def.symbol;
  const seventh = extra.find((i) => i === 10 || i === 11);
  let tensions = extra.filter((i) => i !== seventh);
  // Dyads keep their "no3"/"no5" note at the end.
  const omit = quality === '5' ? '(no3)' : quality === 'M3' || quality === 'm3' ? '(no5)' : '';
  const minor = quality === 'min' || quality === 'm3';
  let base: string;
  if (seventh === undefined) {
    base = quality === '5' ? '5' : quality === 'M3' ? '' : quality === 'm3' ? 'm' : def.symbol;
    // A major 6th on a plain triad is a 6 chord, not an add13.
    if ((quality === 'maj' || quality === 'min') && tensions.includes(9)) {
      base = (minor ? 'm' : '') + '6';
      tensions = tensions.filter((t) => t !== 9);
    }
    // Same for the diminished 7th on a diminished triad.
    if (quality === 'dim' && tensions.includes(9)) {
      base = '°7';
      tensions = tensions.filter((t) => t !== 9);
    }
    const adds = tensions.length ? `(add${tensions.map((t) => TENSION[t]).join(',')})` : '';
    return base + adds + (quality === '5' ? '' : omit);
  }
  const s7 = seventh === 11 ? 'maj7' : '7';
  if (minor) base = seventh === 11 ? 'm(maj7)' : 'm7';
  else if (quality === 'dim') base = seventh === 11 ? '°(maj7)' : 'm7♭5';
  else if (quality === 'aug') base = '+' + s7;
  else if (quality === 'sus2' || quality === 'sus4') base = s7 + quality;
  else base = s7;
  // A lone natural 9 folds into the name: m7 + 9 = m9, maj7 + 9 = maj9.
  if (tensions.length === 1 && tensions[0] === 2 && !base.includes('sus') && quality !== 'dim') {
    base = base.replace('7', '9');
    tensions = [];
  }
  const ext = tensions.length ? `(${tensions.map((t) => TENSION[t]).join(',')})` : '';
  return base + ext + omit;
}

export function chordSymbol(chord: Chord, preferFlats: boolean): string {
  const base = pcName(chord.root, preferFlats) + qualitySymbol(chord);
  return chord.bass !== undefined && chord.bass !== chord.root
    ? `${base}/${pcName(chord.bass, preferFlats)}`
    : base;
}

const NUMERALS = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];

function numeralFor(pc: PitchClass, tonic: PitchClass, lower: boolean): string {
  const n = NUMERALS[mod12(pc - tonic)];
  return lower ? n.toLowerCase() : n;
}

/** Roman numeral relative to the key tonic, e.g. "♭VImaj7", "iv/I". */
export function romanNumeral(chord: Chord, key: Key): string {
  const def = QUALITIES[chord.quality];
  let suffix = qualitySymbol(chord);
  if (def.minor && suffix.startsWith('m') && !suffix.startsWith('maj')) suffix = suffix.slice(1);
  let out = numeralFor(chord.root, key.tonic, def.minor) + suffix;
  if (chord.bass !== undefined && chord.bass !== chord.root) {
    out += '/' + numeralFor(chord.bass, key.tonic, false);
  }
  return out;
}

export function chordNoteNames(chord: Chord, key: Key): string[] {
  const flats = keyPrefersFlats(key);
  const names = chordPcs(chord).map((pc) => pcName(pc, flats));
  if (chord.bass !== undefined && !chordPcs(chord).includes(chord.bass)) {
    names.unshift(pcName(chord.bass, flats));
  }
  return names;
}

/**
 * All qualities whose tones are inside the mode when built on the given degree
 * ("diatonic" qualities). Includes sus/add9/extended where the scale allows.
 */
export function diatonicQualities(key: Key, degree: number): QualityId[] {
  const root = degreePc(key, degree);
  const scale = new Set(MODES[key.mode].steps.map((s) => mod12(key.tonic + s)));
  return QUALITY_IDS.filter((id) =>
    QUALITIES[id].intervals.every((i) => scale.has(mod12(root + i))),
  );
}

/** The plain stacked-thirds triad on a degree. */
export function diatonicTriad(key: Key, degree: number): QualityId {
  const qs = diatonicQualities(key, degree);
  for (const id of ['maj', 'min', 'dim', 'aug'] as QualityId[]) if (qs.includes(id)) return id;
  return qs[0] ?? 'maj';
}

export interface Extension {
  /** Which slot: 7th, 9th, 11th or 13th. */
  label: string;
  interval: number;
}

/** Extension slots, each with the in-key choice first (♭9 in Phrygian, ♯11 in Lydian...). */
const SLOTS: { label: string; options: number[] }[] = [
  { label: '7th', options: [10, 11] },
  { label: '9th', options: [2, 1, 3] },
  { label: '11th', options: [5, 6] },
  { label: '13th', options: [9, 8] },
];

/** The notes that can extend a chord, using the key's scale when the note is in it. */
export function extensionOptions(chord: Chord, key: Key): Extension[] {
  const scale = new Set(MODES[key.mode].steps.map((s) => mod12(key.tonic + s)));
  const own = QUALITIES[chord.quality].intervals;
  const out: Extension[] = [];
  for (const slot of SLOTS) {
    const added = slot.options.find((i) => chord.adds?.includes(i));
    const interval = added ?? slot.options.find((i) => scale.has(mod12(chord.root + i))) ?? slot.options[0];
    if (!own.includes(interval)) out.push({ label: slot.label, interval });
  }
  return out;
}

/** Add the note, or take it out if it's already there. */
export function toggleAdd(chord: Chord, interval: number): Chord {
  const cur = chord.adds ?? [];
  const adds = cur.includes(interval) ? cur.filter((i) => i !== interval) : [...cur, interval].sort((a, b) => a - b);
  return { ...chord, adds: adds.length ? adds : undefined };
}
