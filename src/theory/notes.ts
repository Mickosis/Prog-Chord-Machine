/** Pitch class 0–11 (C = 0). */
export type PitchClass = number;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function pcName(pc: PitchClass, preferFlats: boolean): string {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiName(midi: number, preferFlats = false): string {
  return `${pcName(midi, preferFlats)}${Math.floor(midi / 12) - 1}`;
}

/** Parse "C", "Db", "F#" (no octave) to a pitch class. */
export function parsePc(name: string): PitchClass {
  const m = /^([A-Ga-g])([#b]?)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note name: ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C'];
  return mod12(base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

/** Parse "C2", "Ab1", "F#3" to a MIDI number. */
export function parseMidi(name: string): number {
  const m = /^([A-Ga-g][#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note: ${name}`);
  return parsePc(m[1]) + (Number(m[2]) + 1) * 12;
}

export const ALL_PCS: PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
