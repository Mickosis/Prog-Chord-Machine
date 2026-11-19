import type { Chord, QualityId } from '../theory/chords';
import type { Key } from '../theory/scales';
import { DROP_A_7, DROP_C_6 } from '../tuning/tuning';

export const C_MINOR: Key = { tonic: 0, mode: 'aeolian' };
export const TUNINGS = [DROP_C_6, DROP_A_7];

/** Shorthand chord for tests. */
export const ch = (root: number, quality: QualityId, extra: Partial<Chord> = {}): Chord => ({
  root,
  quality,
  source: 'diatonic',
  ...extra,
});
