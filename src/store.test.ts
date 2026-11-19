import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from './generator/rng';
import { newSong } from './song/model';
import { homeKey, useStore } from './store';
import { ch, C_MINOR } from './test/fixtures';
import { chordPcs, type Chord } from './theory/chords';
import { MODE_IDS, scalePcs, type Key } from './theory/scales';
import { DROP_A_7, DROP_C_6 } from './tuning/tuning';
import { bassString, handDistance } from './voicing/select';

const st = () => useStore.getState();
const chords = () => st().song.sketch.chords;
const roots = () => chords().map((c) => c.chord);

/** Every test starts from the same fresh 4-chord sketch on Drop C. */
beforeEach(() => {
  useStore.setState({
    song: newSong(DROP_C_6.id, C_MINOR, 99),
    past: [],
    future: [],
    editingIndex: null,
    placedAs: null,
    screen: 'start',
  });
  st().newProgression({ chordCount: 4 });
});

describe('generating', () => {
  it('generates from the popup with a chug chord on the open low string', () => {
    for (const chordCount of [3, 8]) {
      st().newProgression({ chordCount });
      expect(st().screen).toBe('sketch');
      expect(chords()).toHaveLength(chordCount);
      expect(chords().some((c) => c.chord.root === 0 && c.frets[0] === 0)).toBe(true);
    }
    expect(Object.keys(st().exposure.voicings).length).toBeGreaterThan(0); // novelty history
  });

  it('auto anchor holds one string per progression, varying between progressions', () => {
    st().updateSketch({ chordCount: 6 });
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      st().generateSketch();
      const strings = new Set(chords().filter((c) => c.chord.root !== 0).map((c) => bassString(c.frets)));
      expect(strings.size).toBeLessThanOrEqual(1);
      seen.add([...strings][0]);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('changes mode but keeps the tonic', () => {
    const { tonic } = st().song.key;
    st().setMode('lydian');
    expect(st().song.key).toEqual({ tonic, mode: 'lydian' });
  });
});

describe('editing chords', () => {
  it('keeps locked chords on regenerate, with undo/redo', () => {
    st().toggleLock('sketch', 1);
    const locked = chords()[1];
    const before = roots();
    st().generateSketch();
    expect(chords()[1]).toEqual(locked);
    st().undo();
    expect(roots()).toEqual(before);
    st().redo();
    expect(chords()[1]).toEqual(locked);
  });

  it('drags a chord to a new slot; a locked chord stays there on regenerate', () => {
    st().toggleLock('sketch', 3);
    const locked = chords()[3];
    const others = chords().slice(0, 3);
    st().moveChordTo('sketch', 3, 0);
    expect(chords()).toEqual([locked, ...others]);
    st().moveChordTo('sketch', 0, 99); // out of range: no-op
    st().generateSketch();
    expect(chords()[0]).toEqual(locked);
  });

  it('floating locks land in new slots on regenerate', () => {
    st().toggleLock('sketch', 2);
    const { chord, frets } = chords()[2];
    st().updateSketch({ floatLocks: true }, false);
    const positions = new Set<number>();
    for (let i = 0; i < 12; i++) {
      st().generateSketch();
      const locked = chords().filter((c) => c.locked);
      expect(locked).toHaveLength(1);
      expect(locked[0]).toMatchObject({ chord, frets });
      positions.add(chords().indexOf(locked[0]));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('swaps a chord and locks it', () => {
    st().swapChord('sketch', 0, ch(3, 'maj'));
    expect(chords()[0]).toMatchObject({ chord: { root: 3, quality: 'maj', source: 'manual' }, locked: true });
    expect(chords()[0].frets.some((f) => f !== null)).toBe(true);
  });

  it('home chord: key centre on its root, best-fitting mode, pinned first', () => {
    const pick = chords()[2];
    st().makeHomeChord(2);
    const key = st().song.key;
    expect(key.tonic).toBe(pick.chord.root);
    expect(chords()[0]).toMatchObject({ frets: pick.frets, locked: true });
    expect(chords()).toHaveLength(4);
    const fit = (c: Chord, k: Key) => chordPcs(c).filter((pc) => scalePcs(k).includes(pc)).length;
    for (const mode of MODE_IDS) expect(fit(pick.chord, { tonic: key.tonic, mode })).toBeLessThanOrEqual(fit(pick.chord, key));
    const eb = ch(3, 'maj');
    for (let i = 0; i < 10; i++) expect(fit(eb, homeKey(eb, createRng(i)))).toBe(3);
  });
});

describe('arrangement and library', () => {
  it('keeps the sketch as sections (add, replace), frozen when the sketch key changes', () => {
    const first = roots();
    st().keepSketch('verse', 'add');
    const verse = st().song.sections[0];
    expect(verse).toMatchObject({ name: 'Verse', keyOverride: st().song.key });
    expect(verse.chords.map((c) => c.chord)).toEqual(first);
    expect(st().placedAs).toBe('Verse');

    st().generateSketch();
    st().keepSketch('verse', 'add');
    expect(st().song.sections.map((s) => s.name)).toEqual(['Verse', 'Verse 2']);

    st().generateSketch();
    const replacement = roots();
    st().keepSketch('verse', 'replace', 0);
    expect(st().song.sections[0].id).toBe(verse.id);
    expect(st().song.sections[0].chords.map((c) => c.chord)).toEqual(replacement);

    const placed = st().song.sections[0];
    st().setKey({ tonic: 7, mode: 'dorian' });
    expect(st().song.sections[0]).toEqual(placed);
  });

  it('edits a section in the sketch and replaces it on keep', () => {
    st().keepSketch('chorus', 'add');
    st().generateSketch();
    st().editInSketch(0);
    expect(st().editingIndex).toBe(0);
    st().swapChord('sketch', 0, ch(5, 'min'));
    st().keepSketch('chorus', 'replace', 0);
    expect(st().editingIndex).toBeNull();
    expect(st().song.sections[0]).toMatchObject({ name: 'Chorus' });
    expect(st().song.sections[0].chords[0].chord.root).toBe(5);
  });

  it('switching to the 7-string moves everything down to the open A', () => {
    st().keepSketch('verse', 'add');
    const before = st().song.sections[0].chords.map((c) => c.chord.root);
    const tonic = st().song.key.tonic;
    st().setTuning(DROP_A_7.id);
    expect(st().song.key.tonic).toBe((tonic + 9) % 12);
    expect(st().song.sections[0].chords.map((c) => c.chord.root)).toEqual(before.map((r) => (r + 9) % 12));
    expect(chords()[0].frets).toHaveLength(7);
    st().setTuning(DROP_C_6.id);
    expect(st().song.sections[0].chords.map((c) => c.chord.root)).toEqual(before);
  });

  it('adds a variation, and saves/loads a favorite through the sketch', () => {
    st().keepSketch('verse', 'add');
    st().duplicateAsVariation(0);
    expect(st().song.sections[1].variationOf).toBe(st().song.sections[0].id);

    st().saveFavorite('sketch', 'idea');
    const fav = st().library.favorites[0];
    st().generateSketch();
    st().loadFavoriteIntoSketch(fav.id);
    expect(roots()).toEqual(fav.chords.map((c) => c.chord));
  });

  it('a new song starts empty on the start screen', () => {
    st().keepSketch('verse', 'add');
    st().newSongClean();
    expect(st().song.sections).toHaveLength(0);
    expect(chords()).toHaveLength(0);
    expect(st().screen).toBe('start');
  });
});

describe('one chord at a time', () => {
  it('shuffle re-picks only that chord, and never to the same chord', () => {
    for (let i = 0; i < 6; i++) {
      const before = roots();
      st().shuffleChord('sketch', 1);
      const after = roots();
      expect(after[1]).not.toEqual(before[1]);
      expect([after[0], after[2], after[3]]).toEqual([before[0], before[2], before[3]]);
      // There is still a chord to chug on.
      expect(after.some((c) => c.root === 0 && c.bass === undefined)).toBe(true);
    }
  });

  it('extend adds a note, voices it and keeps the chord through New', () => {
    st().toggleExtension('sketch', 0, 10);
    const c = chords()[0];
    expect(c.chord.adds).toEqual([10]);
    expect(c.locked).toBe(true);
    const sounded = c.frets.flatMap((f, s) => (f === null ? [] : [(DROP_C_6.strings[s] + f) % 12]));
    expect(new Set(sounded)).toEqual(new Set(chordPcs(c.chord)));
    st().generateSketch();
    expect(chords().some((x) => x.chord.adds?.includes(10))).toBe(true);
  });

  it('extending keeps the chord where it is on the neck', () => {
    for (let ci = 0; ci < chords().length; ci++) {
      const before = chords()[ci].frets;
      st().toggleExtension('sketch', ci, 10);
      const after = chords()[ci].frets;
      if (after === before) continue; // no playable shape for this one
      expect(bassString(after)).toBe(bassString(before));
      expect(handDistance(after, before)).toBeLessThanOrEqual(2);
    }
  });
});

