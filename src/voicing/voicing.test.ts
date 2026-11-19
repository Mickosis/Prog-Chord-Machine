import { describe, expect, it } from 'vitest';
import { ch, C_MINOR, TUNINGS } from '../test/fixtures';
import { chordPcs, diatonicTriad, type Chord } from '../theory/chords';
import { degreePc } from '../theory/scales';
import { DROP_C_6 } from '../tuning/tuning';
import { emptyExposure, mudFactor, rankVoicings, type VoicingPrefs } from './select';
import { countFingers, fretsLabel, MAX_NOTES, MIN_NOTES, solveVoicings } from './solver';

const prefs = (p: Partial<VoicingPrefs> = {}): VoicingPrefs => ({ openFreq: 'sometimes', maxStretch: 4, novelty: 0, ...p });

describe('voicing solver', () => {
  it('shapes sound 2–3 strings, bass lowest, every chord tone and nothing else, within the stretch', () => {
    const chords: Chord[] = [ch(8, 'maj'), ch(0, '5'), ch(2, 'm3'), ch(2, '5', { bass: 0, source: 'polychord' })];
    for (const t of TUNINGS) {
      for (const chord of chords) {
        const all = solveVoicings(t, chord, { maxStretch: 4 });
        expect(all.length).toBeGreaterThan(3);
        const tones = new Set([...chordPcs(chord), chord.bass ?? chord.root]);
        for (const v of all) {
          expect(v.pitches.length).toBeGreaterThanOrEqual(MIN_NOTES);
          expect(v.pitches.length).toBeLessThanOrEqual(MAX_NOTES);
          expect(v.pitches[0] % 12).toBe(chord.bass ?? chord.root);
          expect(new Set(v.pitches.map((p) => p % 12))).toEqual(tones);
          const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
        }
      }
      expect(solveVoicings(t, ch(2, 'min'), { maxStretch: 4 }).some((v) => v.families.includes('root5'))).toBe(true);
    }
  });

  it('never returns the bare one-finger drop-tuning power chord', () => {
    expect(countFingers([5, 5, 5, null, null, null])).toBe(1);
    expect(countFingers([5, 5, 7, 7, 6, null])).toBe(4);
    const labels = solveVoicings(DROP_C_6, ch(5, '5'), { maxStretch: 4 }).map((v) => fretsLabel(v.frets));
    expect(labels).not.toContain('5-5-x-x-x-x');
    expect(labels).not.toContain('5-5-5-x-x-x');
  });
});

describe('voicing ranking', () => {
  it('hides the open low string when off, and forces it for the chug chord', () => {
    const off = rankVoicings(DROP_C_6, ch(0, 'min'), prefs({ openFreq: 'off' }), emptyExposure());
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((v) => !v.usesOpenLow)).toBe(true);
    for (const quality of ['5', 'min', 'maj', 'sus2'] as const) {
      const chug = rankVoicings(DROP_C_6, ch(0, quality), prefs({ openFreq: 'off', chug: true }), emptyExposure());
      expect(chug.length).toBeGreaterThan(0);
      expect(chug.every((v) => v.frets[0] === 0)).toBe(true);
    }
  });

  it('keeps close intervals out of the low register in top-ranked shapes', () => {
    for (let d = 0; d < 7; d++) {
      const chord = ch(degreePc(C_MINOR, d), diatonicTriad(C_MINOR, d));
      for (const t of TUNINGS) {
        for (const v of rankVoicings(t, chord, prefs({ openHigh: 0.6 }), emptyExposure()).slice(0, 5)) {
          expect(mudFactor(v.pitches)).toBeGreaterThanOrEqual(0.75);
        }
      }
    }
  });
});
