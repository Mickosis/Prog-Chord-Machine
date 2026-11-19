import { mod12, type PitchClass } from './notes';

export type ModeId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'
  | 'harmonicMinor'
  | 'phrygianDominant';

export interface ModeDef {
  id: ModeId;
  label: string;
  steps: number[]; // semitone offsets of the 7 degrees from tonic
}

export const MODES: Record<ModeId, ModeDef> = {
  ionian: { id: 'ionian', label: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11] },
  dorian: { id: 'dorian', label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { id: 'phrygian', label: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { id: 'lydian', label: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { id: 'mixolydian', label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  aeolian: { id: 'aeolian', label: 'Minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
  locrian: { id: 'locrian', label: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
  harmonicMinor: { id: 'harmonicMinor', label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  phrygianDominant: {
    id: 'phrygianDominant',
    label: 'Phrygian dominant',
    steps: [0, 1, 4, 5, 7, 8, 10],
  },
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

/** Modes that suit prog metal, shown first in the mode picker. */
export const PROG_MODES: ModeId[] = [
  'phrygian',
  'lydian',
  'dorian',
  'aeolian',
  'phrygianDominant',
  'harmonicMinor',
  'locrian',
];

/** How often each mode is picked for a new progression: prog modes first. */
export const MODE_WEIGHTS: Record<ModeId, number> = {
  phrygian: 3,
  aeolian: 3,
  lydian: 2.5,
  dorian: 2.5,
  phrygianDominant: 2,
  harmonicMinor: 2,
  locrian: 1,
  ionian: 0.8,
  mixolydian: 0.8,
};

export const OTHER_MODES: ModeId[] = MODE_IDS.filter((m) => !PROG_MODES.includes(m));

/** Modes we borrow from (parallel modes). */
export const BORROW_MODES: ModeId[] = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'harmonicMinor',
];

export interface Key {
  tonic: PitchClass;
  mode: ModeId;
}

export function scalePcs(key: Key): PitchClass[] {
  return MODES[key.mode].steps.map((s) => mod12(key.tonic + s));
}

/** Pitch class of the scale degree (0-based, wraps). */
export function degreePc(key: Key, degree: number): PitchClass {
  const steps = MODES[key.mode].steps;
  return mod12(key.tonic + steps[((degree % 7) + 7) % 7]);
}

const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb

/** Decide flats vs sharps by looking at the parent major key of the mode. */
export function keyPrefersFlats(key: Key): boolean {
  // Offset from the mode's tonic down to its parent major tonic.
  const parentOffset: Record<ModeId, number> = {
    ionian: 0,
    dorian: -2,
    phrygian: -4,
    lydian: -5,
    mixolydian: -7,
    aeolian: -9,
    locrian: -11,
    harmonicMinor: -9, // spell like natural minor
    phrygianDominant: -4, // spell like phrygian
  };
  return FLAT_MAJOR_TONICS.has(mod12(key.tonic + parentOffset[key.mode]));
}
