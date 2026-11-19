import { midiName, mod12, parseMidi } from '../theory/notes';

export interface Tuning {
  id: string;
  name: string;
  /** MIDI note per string, LOWEST string first. */
  strings: number[];
  builtIn?: boolean;
}

export const DROP_C_6: Tuning = {
  id: 'dropC6',
  name: 'Drop C (6-string)',
  strings: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'].map(parseMidi),
  builtIn: true,
};

export const DROP_A_7: Tuning = {
  id: 'dropA7',
  name: 'Drop A (7-string)',
  strings: ['A1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseMidi),
  builtIn: true,
};

export const BUILT_IN_TUNINGS: Tuning[] = [DROP_C_6, DROP_A_7];

/** Guitar string number (1 = highest) for an index from the low side. */
export const stringNumber = (t: Tuning, index: number): number => t.strings.length - index;

export const lowStringPc = (t: Tuning): number => mod12(t.strings[0]);

export function tuningLabel(t: Tuning): string {
  return t.strings.map((m) => midiName(m, true).replace(/-?\d+$/, '')).join(' ');
}

export function validateTuning(t: Tuning): string | null {
  if (!t.name.trim()) return 'Name is required';
  if (t.strings.length < 4 || t.strings.length > 9) return 'Use 4–9 strings';
  for (let i = 1; i < t.strings.length; i++) {
    if (t.strings[i] <= t.strings[i - 1]) return 'Strings must rise in pitch from low to high';
  }
  return null;
}
