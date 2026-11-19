import {
  diatonicQualities,
  type Chord,
  type QualityId,
} from '../theory/chords';
import { mod12, type PitchClass } from '../theory/notes';
import { BORROW_MODES, degreePc, MODES, type Key } from '../theory/scales';
import type { SectionType, Spice } from '../song/model';
import type { Rng } from './rng';

/** Weight for moving from one scale degree to another, by degree distance. */
const MOVE_WEIGHTS: Record<number, number> = {
  0: 0, // never repeat
  1: 2, // step up
  2: 1.5, // third up
  3: 3, // fourth up (strong)
  4: 1.5, // fifth up
  5: 2.5, // third down
  6: 2.5, // step down
};

const START_WEIGHTS: Partial<Record<SectionType, Record<number, number>>> = {
  intro: { 0: 4, 5: 2, 3: 1 },
  verse: { 0: 5, 5: 1.5, 3: 1.5 },
  pre: { 3: 3, 1: 2, 5: 2, 2: 1 },
  chorus: { 5: 3, 3: 3, 0: 2, 2: 1.5 },
  bridge: { 3: 2, 5: 2, 1: 2, 2: 2, 6: 1.5 },
  breakdown: { 0: 5, 1: 1 },
  solo: { 0: 2, 5: 2, 3: 2 },
  outro: { 0: 3, 5: 2, 3: 1 },
  // The sketch: a general-purpose progression that could become any section.
  custom: { 0: 4, 5: 2, 3: 2, 2: 1, 1: 0.6 },
};

const END_WEIGHTS: Partial<Record<SectionType, Record<number, number>>> = {
  verse: { 4: 2.5, 6: 2.5, 3: 2 },
  pre: { 4: 3, 6: 2.5, 3: 1.5 },
  bridge: { 4: 2.5, 6: 2 },
  intro: { 4: 2, 0: 1.5 },
  outro: { 0: 4 },
  custom: { 4: 2, 6: 2, 3: 1.5 },
};

export interface ProgressionInput {
  key: Key;
  type: SectionType;
  chordCount: number;
  spice: Spice;
  /** Chords pinned at positions (lock / variation prefix). */
  locked: (Chord | undefined)[];
  /** Roots other sections already start on (contrast). */
  avoidFirstRoots: PitchClass[];
  /** The open low string's note: at least one chord is rooted on it, to chug on. */
  chugPc?: PitchClass;
  /** Keep these roots/degrees and only recolour qualities. */
  keepRoots?: Chord[];
}

/**
 * Quality weights per spice level (1 = Heavy, 2 = Atmospheric, 3 = Out there).
 * Heavy leans on power dyads and plain triads; Atmospheric on sus chords and
 * open thirds; Out there lets in diminished and augmented.
 */
const QUALITY_WEIGHTS: Record<Spice, Record<QualityId, number>> = {
  0: { '5': 3, M3: 0.4, m3: 0.4, maj: 2, min: 2, sus2: 0.8, sus4: 0.8, dim: 0, aug: 0 },
  1: { '5': 3, M3: 0.7, m3: 0.7, maj: 2, min: 2, sus2: 1, sus4: 1, dim: 0.3, aug: 0 },
  2: { '5': 1, M3: 1, m3: 1, maj: 2, min: 2, sus2: 2.5, sus4: 1.5, dim: 0.3, aug: 0.2 },
  3: { '5': 1, M3: 0.8, m3: 0.8, maj: 1.5, min: 1.5, sus2: 1.5, sus4: 1.5, dim: 1, aug: 1 },
};

const qualityWeight = (id: QualityId, spice: Spice): number => QUALITY_WEIGHTS[spice][id];

export function chooseQuality(candidates: QualityId[], spice: Spice, rng: Rng): QualityId | undefined {
  const usable = candidates.filter((id) => qualityWeight(id, spice) > 0);
  if (usable.length === 0) return undefined;
  return rng.weighted(usable, (id) => qualityWeight(id, spice));
}

function diatonicChord(key: Key, degree: number, spice: Spice, rng: Rng): Chord {
  const q = chooseQuality(diatonicQualities(key, degree), spice, rng) ?? 'maj';
  return { root: degreePc(key, degree), quality: q, source: 'diatonic', degree };
}

function borrowedChord(key: Key, degree: number, spice: Spice, rng: Rng): Chord | undefined {
  const modes = BORROW_MODES.filter((m) => m !== key.mode);
  for (let tries = 0; tries < 4; tries++) {
    const mode = rng.pick(modes);
    const bk: Key = { tonic: key.tonic, mode };
    const root = degreePc(bk, degree);
    const q = chooseQuality(diatonicQualities(bk, degree), spice, rng);
    if (!q) continue;
    const native = diatonicQualities(key, degree);
    const same = root === degreePc(key, degree) && native.includes(q);
    if (!same) return { root, quality: q, source: 'borrowed', degree };
  }
  return undefined;
}

const MEDIANT_QUALITIES: QualityId[] = ['maj', 'min', 'sus2', '5', 'M3'];

function outsideChord(key: Key, degree: number, prev: Chord | undefined, spice: Spice, rng: Rng): Chord | undefined {
  const kind = rng.weighted(['mediant', 'tritone', 'polychord'] as const, (k) =>
    k === 'tritone' && degree !== 4 ? 0.3 : 1,
  );
  const base = prev?.root ?? key.tonic;
  if (kind === 'mediant') {
    const root = mod12(base + rng.pick([3, 4, 8, 9]));
    const q = chooseQuality(MEDIANT_QUALITIES, spice, rng) ?? 'maj';
    return { root, quality: q, source: 'mediant' };
  }
  if (kind === 'tritone') {
    // Substitute the dominant of the next target with the chord a tritone away.
    const target = degree === 4 ? degreePc(key, 4) : degreePc(key, degree);
    return { root: mod12(target + 6), quality: rng.pick(['maj', '5', 'sus4'] as QualityId[]), source: 'tritone' };
  }
  // Polychord: an upper power dyad over a bass note (e.g. D5/C), three notes in all.
  const bass = degreePc(key, degree);
  const upper = mod12(bass + rng.pick([2, 10, 7]));
  return { root: upper, quality: '5', bass, source: 'polychord', degree };
}

function degreeOf(key: Key, pc: PitchClass): number | undefined {
  const i = MODES[key.mode].steps.findIndex((s) => mod12(key.tonic + s) === pc);
  return i >= 0 ? i : undefined;
}

function pickDegree(
  input: ProgressionInput,
  pos: number,
  prevDegree: number | undefined,
  used: Set<number>,
  rng: Rng,
): number {
  const degrees = [0, 1, 2, 3, 4, 5, 6];
  const last = pos === input.chordCount - 1;
  return rng.weighted(degrees, (d) => {
    let w: number;
    if (prevDegree === undefined) {
      w = START_WEIGHTS[input.type]?.[d] ?? 0.5;
      const root = degreePc(input.key, d);
      if (input.avoidFirstRoots.includes(root)) w *= 0.15;
    } else {
      w = MOVE_WEIGHTS[mod7(d - prevDegree)];
      if (used.has(d)) w *= 0.5;
      if (last) w *= END_WEIGHTS[input.type]?.[d] ?? 1;
    }
    // Diminished-only degrees are awkward in grounded sections.
    const dimOnly = !diatonicQualities(input.key, d).some((q) => q === 'maj' || q === 'min');
    if (dimOnly) w *= input.spice === 0 ? 0.1 : 0.4;
    return w;
  });
}

const mod7 = (n: number) => ((n % 7) + 7) % 7;

export function generateProgression(input: ProgressionInput, rng: Rng): Chord[] {
  const out: Chord[] = [];
  const used = new Set<number>();
  let prevDegree: number | undefined;

  for (let pos = 0; pos < input.chordCount; pos++) {
    const locked = input.locked[pos];
    if (locked) {
      out.push(locked);
      prevDegree = locked.degree ?? degreeOf(input.key, locked.root) ?? prevDegree;
      if (prevDegree !== undefined) used.add(prevDegree);
      continue;
    }

    const keep = input.keepRoots?.[pos];
    let chord: Chord;
    if (keep) {
      const d = keep.degree ?? degreeOf(input.key, keep.root);
      const candidates =
        d !== undefined && degreePc(input.key, d) === keep.root
          ? diatonicQualities(input.key, d)
          : MEDIANT_QUALITIES;
      const q = chooseQuality(candidates, input.spice, rng) ?? keep.quality;
      chord = { ...keep, quality: q, adds: undefined, bass: keep.source === 'polychord' ? keep.bass : undefined };
    } else {
      const degree = pickDegree(input, pos, prevDegree, used, rng);
      const prev = out[pos - 1];
      chord = diatonicChord(input.key, degree, input.spice, rng);
      // Borrow sparingly: the mode's own colour is the point (Lydian ♯4, Phrygian ♭2...).
      if (input.spice >= 3 && pos > 0 && rng.chance(0.25)) {
        chord = outsideChord(input.key, degree, prev, input.spice, rng) ?? chord;
      } else if (input.spice >= 1 && rng.chance(0.05 + 0.04 * input.spice)) {
        chord = borrowedChord(input.key, degree, input.spice, rng) ?? chord;
      }
      // Don't repeat the exact previous chord.
      if (prev && prev.root === chord.root && prev.quality === chord.quality) {
        chord = diatonicChord(input.key, mod7(degree + 3), input.spice, rng);
      }
    }

    out.push(chord);
    prevDegree = chord.degree ?? degreeOf(input.key, chord.root) ?? prevDegree;
    if (prevDegree !== undefined) used.add(prevDegree);
  }
  if (input.chugPc !== undefined) addChugChord(out, input, input.chugPc, rng);
  return out;
}

/**
 * Make sure one chord is rooted on the open low string's note, so there is
 * something to chug on. Only an unlocked chord is replaced; the rest stay.
 */
function addChugChord(out: Chord[], input: ProgressionInput, chugPc: PitchClass, rng: Rng): void {
  if (out.some((c) => c.root === chugPc && c.bass === undefined)) return;
  const free = out.map((_, i) => i).filter((i) => !input.locked[i] && !input.keepRoots?.[i]);
  if (!free.length) return;
  // Riffs often start on it; anywhere else is fine too.
  const pos = rng.weighted(free, (i) => (i === 0 ? 2 : 1));
  const d = degreeOf(input.key, chugPc);
  if (d === undefined) {
    out[pos] = { root: chugPc, quality: '5', source: 'borrowed' };
    return;
  }
  const usable = diatonicQualities(input.key, d).filter((q) => q !== 'dim' && q !== 'aug');
  const quality = chooseQuality(usable, input.spice, rng) ?? '5';
  out[pos] = { root: chugPc, quality, source: 'diatonic', degree: d };
}

/** Chords a player could swap in at any position (for the manual swap menu). */
export function swapSuggestions(key: Key, spice: Spice): Chord[] {
  const out: Chord[] = [];
  const seen = new Set<string>();
  const add = (c: Chord) => {
    const k = `${c.root}:${c.quality}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };
  for (let d = 0; d < 7; d++) {
    for (const q of diatonicQualities(key, d)) {
      if (qualityWeight(q, spice) > 0) add({ root: degreePc(key, d), quality: q, source: 'diatonic', degree: d });
    }
  }
  if (spice >= 1) {
    for (const mode of BORROW_MODES) {
      if (mode === key.mode) continue;
      const bk: Key = { tonic: key.tonic, mode };
      for (let d = 0; d < 7; d++) {
        const root = degreePc(bk, d);
        for (const q of diatonicQualities(bk, d)) {
          if (q !== 'maj' && q !== 'min') continue;
          add({ root, quality: q, source: 'borrowed', degree: d });
        }
      }
    }
  }
  return out;
}
