import { describe, expect, it } from 'vitest';
import { ch, C_MINOR, TUNINGS } from '../test/fixtures';
import { newSection, newSketch, newSong, type Section, type Song } from '../song/model';
import { DROP_A_7, DROP_C_6 } from '../tuning/tuning';
import { bassString, emptyExposure, handDistance } from '../voicing/select';
import { generateProgression, type ProgressionInput } from './progression';
import { createRng } from './rng';
import { generateSketch, generateSong, hasChugChord, pickKey, voiceInOrder } from './song';

const input = (p: Partial<ProgressionInput> = {}): ProgressionInput => ({
  key: C_MINOR,
  type: 'verse',
  chordCount: 6,
  spice: 2,
  locked: [],
  avoidFirstRoots: [],
  ...p,
});

describe('progression', () => {
  it('is reproducible for a seed and keeps locked chords in place', () => {
    expect(generateProgression(input(), createRng(42))).toEqual(generateProgression(input(), createRng(42)));
    const lock = ch(3, 'maj', { source: 'manual' });
    const out = generateProgression(input({ chordCount: 4, locked: [undefined, lock], chugPc: 0 }), createRng(7));
    expect(out).toHaveLength(4);
    expect(out[1]).toBe(lock);
    expect(out.some((c) => c.root === 0)).toBe(true); // chug chord added around the lock
  });
});

describe('keys and the chug chord', () => {
  it('picks varied keys that all hold a chord on the open low string', () => {
    for (const t of TUNINGS) {
      const tonics = new Set<number>();
      for (let i = 0; i < 60; i++) {
        const key = pickKey(t, createRng(i));
        expect(hasChugChord(key, t.strings[0] % 12)).toBe(true);
        tonics.add(key.tonic);
      }
      expect(tonics.size).toBeGreaterThan(3);
    }
  });

  it('every progression has a chord on the open low string, played open, and no slash chords over it', () => {
    for (const t of TUNINGS) {
      const low = t.strings[0] % 12;
      for (let i = 0; i < 40; i++) {
        const song: Song = { ...newSong(t.id, pickKey(t, createRng(i)), i * 7 + 1), sketch: newSketch({ chordCount: 2 + (i % 7) }) };
        const { chords } = generateSketch(song, t, emptyExposure());
        const chug = chords.filter((c) => c.chord.root === low && c.chord.bass === undefined);
        expect(chug.length).toBeGreaterThan(0);
        for (const c of chug) expect(c.frets[0]).toBe(0);
        expect(chords.some((c) => c.chord.bass === low)).toBe(false);
      }
    }
  });
});

describe('sections and voice leading', () => {
  it('generates playable sections and exact-repeat variations in both tunings', () => {
    for (const t of TUNINGS) {
      const base = newSong(t.id, C_MINOR, 1234);
      const sketch = generateSketch(base, t, emptyExposure());
      expect(generateSketch(base, t, emptyExposure()).chords).toEqual(sketch.chords);
      const chorus = newSection('chorus');
      const repeat: Section = { ...newSection('chorus'), variationOf: chorus.id, variationMode: 'copy' };
      const out = generateSong({ ...base, sections: [{ ...sketch, id: 'v', type: 'verse' }, chorus, repeat] }, t, emptyExposure());
      for (const s of out.sections) for (const c of s.chords) expect(c.frets.some((f) => f !== null)).toBe(true);
      expect(out.sections[2].chords.map((c) => c.chord)).toEqual(out.sections[1].chords.map((c) => c.chord));
    }
  });

  it('voices neighbouring chords close together', () => {
    const song = newSong(DROP_C_6.id, C_MINOR, 1);
    const section = newSection('verse');
    const chords = [ch(5, 'min'), ch(8, 'maj'), ch(3, 'sus2'), ch(10, 'maj')];
    let near = 0;
    let far = 0;
    for (let seed = 0; seed < 100; seed++) {
      const linked = voiceInOrder(DROP_C_6, chords, song, section, emptyExposure(), createRng(seed));
      const loose = chords.map((c, i) => voiceInOrder(DROP_C_6, [c], song, section, emptyExposure(), createRng(seed * 31 + i))[0]);
      for (let i = 1; i < chords.length; i++) {
        near += handDistance(linked[i], linked[i - 1]);
        far += handDistance(loose[i], loose[i - 1]);
      }
    }
    expect(near).toBeLessThan(far * 0.85);
  });

  it('keeps the bass on the anchor string (except the chug chord on the open string)', () => {
    const song = newSong(DROP_A_7.id, C_MINOR, 1);
    for (const anchorString of [7, 6, 5, 4]) {
      const section: Section = { ...newSection('verse'), anchorString };
      for (let seed = 0; seed < 10; seed++) {
        const chords = generateProgression(input({ spice: 3 }), createRng(seed));
        voiceInOrder(DROP_A_7, chords, song, section, emptyExposure(), createRng(seed)).forEach((f, i) => {
          if (chords[i].root !== 9) expect(bassString(f)).toBe(7 - anchorString);
        });
      }
    }
  });
});
