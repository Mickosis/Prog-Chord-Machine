import { create } from 'zustand';
import { playSequence, stopPlayback } from './audio/player';
import {
  generateSection,
  generateSketch,
  generateSong,
  pickKey,
  rerollChord,
  voiceChord,
  voiceInOrder,
  voicingPrefs,
} from './generator/song';
import { createRng, hashSeed, type Rng } from './generator/rng';
import { chordPcs, simplifyQuality, toggleAdd, type Chord } from './theory/chords';
import { mod12 } from './theory/notes';
import { MODE_IDS, MODE_WEIGHTS, scalePcs, type Key, type ModeId } from './theory/scales';
import {
  newId,
  newSketch,
  newSong,
  nextSectionName,
  sectionKey,
  type Section,
  type SectionType,
  type Song,
  type SongChord,
} from './song/model';
import {
  loadCurrentSong,
  loadExposure,
  loadLibrary,
  saveCurrentSong,
  saveCustomTunings,
  saveExposure,
  saveFavorites,
  saveSongs,
  type FavoriteProgression,
  type LibraryData,
} from './storage/storage';
import { BUILT_IN_TUNINGS, DROP_C_6, lowStringPc, type Tuning } from './tuning/tuning';
import { stayInPosition, type Exposure } from './voicing/select';
import { classify, maxNotes, voicingKey, type Frets } from './voicing/solver';

const HISTORY_LIMIT = 60;

interface State {
  song: Song;
  past: Song[];
  future: Song[];
  exposure: Exposure;
  library: LibraryData;
  playing: Playing | null;
  /** What is playing: 'sketch', 'song' or a section id. */
  playback: string | null;
  /** Arrangement index the sketch was loaded from via "Edit in sketch". */
  editingIndex: number | null;
  /** Name of the section the sketch was last placed as. */
  placedAs: string | null;
  /** Which screen is showing. Every launch starts on 'start'. */
  screen: Screen;

  tuning: () => Tuning;
  allTunings: () => Tuning[];

  commit: (next: Song) => void;
  undo: () => void;
  redo: () => void;

  setScreen: (screen: Screen) => void;
  /** Fresh progression from the popup: new key and mode, with a chug chord on the open low string. */
  newProgression: (opts: NewProgressionOptions) => void;
  /** Change the mode; the tonic stays. */
  setMode: (mode: ModeId) => void;
  generateSketch: () => void;
  updateSketch: (patch: Partial<Section>, regenerate?: boolean) => void;
  keepSketch: (type: SectionType, mode: 'add' | 'replace', replaceIndex?: number) => void;
  editInSketch: (index: number) => void;
  newSongClean: () => void;
  updateSong: (patch: Partial<Song>) => void;
  setKey: (key: Key) => void;
  setTuning: (id: string) => void;
  removeSection: (index: number) => void;
  moveSection: (index: number, dir: -1 | 1) => void;
  duplicateAsVariation: (index: number) => void;

  toggleLock: (target: ChordTarget, ci: number) => void;
  /** Move a chord to another slot (drag and drop); it keeps its shape and lock. */
  moveChordTo: (target: ChordTarget, from: number, to: number) => void;
  /** Make a sketch chord the home chord: key centre on its root, mode that fits it, regenerate around it. */
  makeHomeChord: (ci: number) => void;
  swapChord: (target: ChordTarget, ci: number, chord: Chord) => void;
  /** Re-pick one chord at random; the rest of the row stays. */
  shuffleChord: (target: ChordTarget, ci: number) => void;
  /** Add (or remove) an extension note, e.g. the 7th or 9th, and re-voice the chord. */
  toggleExtension: (target: ChordTarget, ci: number, interval: number) => void;
  setFrets: (target: ChordTarget, ci: number, frets: Frets) => void;

  saveSongToLibrary: () => void;
  loadSong: (id: string) => void;
  deleteSong: (id: string) => void;
  saveFavorite: (target: ChordTarget, name: string) => void;
  loadFavoriteIntoSketch: (favId: string) => void;
  deleteFavorite: (id: string) => void;
  importLibrary: (data: LibraryData) => void;

  addTuning: (t: Tuning) => void;
  deleteTuning: (id: string) => void;
  setPlaying: (p: Playing | null) => void;
  /** Start (or, if already playing, stop) a row or the whole song. */
  togglePlay: (id: string) => void;
  stop: () => void;
}

export type Screen = 'start' | 'sketch' | 'song';

export interface NewProgressionOptions {
  chordCount: number;
}

/** A chord row: the sketch or an arrangement section by index. */
export type ChordTarget = 'sketch' | number;

export interface Playing {
  target: ChordTarget;
  chord: number;
}

function bumpExposure(exposure: Exposure, tuning: Tuning, song: Song, prev?: Song): Exposure {
  const rows = (x: Song) => [x.sketch, ...x.sections];
  const seen = new Set(prev ? rows(prev).flatMap((s) => s.chords.map((c) => voicingKey(tuning, c.frets))) : []);
  const next: Exposure = { voicings: { ...exposure.voicings }, families: { ...exposure.families } };
  for (const s of rows(song)) {
    for (const c of s.chords) {
      const k = voicingKey(tuning, c.frets);
      if (seen.has(k) || c.frets.every((f) => f === null)) continue;
      seen.add(k);
      next.voicings[k] = (next.voicings[k] ?? 0) + 1;
      for (const f of classify(c.frets, tuning, c.chord)) next.families[f] = (next.families[f] ?? 0) + 1;
    }
  }
  saveExposure(next);
  return next;
}

const lib = loadLibrary();
const tuningsOf = (l: LibraryData) => [...BUILT_IN_TUNINGS, ...l.customTunings];

/** Fill fields added after a song was saved (library songs from older versions). */
function normalizeSong(s: Song): Song {
  const fix = (x: Section): Section => {
    // Drop fields from older versions (vibe, drone mode).
    const clean = { ...x } as Section & { vibe?: unknown; pedal?: unknown };
    delete clean.vibe;
    delete clean.pedal;
    return {
      ...clean,
      anchor: x.anchor ?? 'auto',
      chords: x.chords.map((c) => ({ ...c, chord: simplifyChord(c.chord) })),
    };
  };
  return {
    ...s,
    loop: s.loop ?? true,
    click: s.click ?? false,
    sketch: fix(s.sketch ?? newSketch()),
    sections: s.sections.map(fix),
  };
}

function freshSong(tuningId = DROP_C_6.id, base?: Partial<Song>): Song {
  const s: Song = { ...newSong(tuningId, base?.key ?? { tonic: 0, mode: 'aeolian' }), ...base, sections: [] };
  return s;
}

/** Older saves used 7ths/9ths and 4–6 note shapes: map to dyads/triads. */
function simplifyChord(c: Chord): Chord {
  const chord: Chord = { ...c, quality: simplifyQuality(c.quality) };
  // The old drone mode put the open low string under every chord: drop that bass.
  return (c.source as string) === 'pedal' ? { ...chord, bass: undefined, source: 'diatonic' } : chord;
}

const sounded = (f: Frets) => f.filter((x) => x !== null).length;

/** Re-voice any chord whose shape no longer fits (too many notes, or notes outside the chord). */
function fitSection(section: Section, song: Song, tuning: Tuning, exposure: Exposure): Section {
  const fits = (c: SongChord) => {
    if (c.frets.length !== tuning.strings.length || sounded(c.frets) > maxNotes(c.chord)) return false;
    const pcs = new Set([...chordPcs(c.chord), c.chord.bass ?? c.chord.root]);
    return c.frets.every((f, i) => f === null || pcs.has(mod12(tuning.strings[i] + f)));
  };
  if (section.chords.every(fits)) return section;
  const keep = section.chords.map((c) => (fits(c) ? c.frets : undefined));
  const frets = voiceInOrder(tuning, section.chords.map((c) => c.chord), song, section, exposure, createRng(song.seed), keep);
  return { ...section, chords: section.chords.map((c, i) => ({ ...c, frets: frets[i] })) };
}

function fitSong(song: Song, tuning: Tuning, exposure: Exposure): Song {
  return {
    ...song,
    sketch: fitSection(song.sketch, song, tuning, exposure),
    sections: song.sections.map((x) => fitSection(x, song, tuning, exposure)),
  };
}

/** Move chords and keys by a number of semitones (used when the low string changes). */
const transposeChord = (c: Chord, d: number): Chord => ({
  ...c,
  root: mod12(c.root + d),
  bass: c.bass === undefined ? undefined : mod12(c.bass + d),
});
const transposeKey = (k: Key, d: number): Key => ({ ...k, tonic: mod12(k.tonic + d) });

/**
 * Key with the chord's root as tonic, in the mode that holds the most of its
 * notes. Ties go to the prog favourites.
 */
export function homeKey(chord: Chord, rng: Rng): Key {
  const pcs = new Set(chordPcs(chord));
  if (chord.bass !== undefined) pcs.add(chord.bass);
  const fit = (mode: ModeId) => {
    const scale = new Set(scalePcs({ tonic: chord.root, mode }));
    return [...pcs].filter((pc) => scale.has(pc)).length;
  };
  const best = Math.max(...MODE_IDS.map(fit));
  const modes = MODE_IDS.filter((m) => fit(m) === best);
  const mode = rng.weighted(modes, (m) => MODE_WEIGHTS[m]);
  return { tonic: chord.root, mode };
}

const savedSong = loadCurrentSong();

/** With nothing saved, start empty: the "New progression" popup opens instead. */
function initialSong(): Song {
  if (!savedSong) return freshSong();
  const song = normalizeSong(savedSong);
  const tuning = tuningsOf(lib).find((t) => t.id === song.tuningId) ?? DROP_C_6;
  return fitSong(song, tuning, loadExposure());
}

export const useStore = create<State>((set, get) => {
  const withSection = (target: ChordTarget, fn: (s: Section) => Section): Song => {
    const song = get().song;
    if (target === 'sketch') return { ...song, sketch: fn(song.sketch) };
    return { ...song, sections: song.sections.map((s, i) => (i === target ? fn(s) : s)) };
  };
  const sectionOf = (song: Song, target: ChordTarget): Section =>
    target === 'sketch' ? song.sketch : song.sections[target];

  const regenerateSketch = (song: Song) => {
    const { exposure } = get();
    const tuning = get().tuning();
    const next = { ...song, sketch: generateSketch(song, tuning, exposure) };
    set({ exposure: bumpExposure(exposure, tuning, next, song), placedAs: null });
    get().commit(next);
  };

  const regenerate = (song: Song, onlyIndex?: number) => {
    const { exposure } = get();
    const tuning = get().tuning();
    const next = generateSong(song, tuning, exposure, onlyIndex);
    set({ exposure: bumpExposure(exposure, tuning, next, song) });
    get().commit(next);
  };

  return {
    song: initialSong(),
    past: [],
    future: [],
    exposure: loadExposure(),
    library: lib,
    playing: null,
    playback: null,
    editingIndex: null,
    placedAs: null,
    // Every launch starts on the start screen; the last sketch can be resumed from there.
    screen: 'start',

    tuning: () => tuningsOf(get().library).find((t) => t.id === get().song.tuningId) ?? DROP_C_6,
    allTunings: () => tuningsOf(get().library),

    commit: (next) => {
      set((st) => ({ song: next, past: [...st.past, st.song].slice(-HISTORY_LIMIT), future: [] }));
      saveCurrentSong(next);
    },
    undo: () => {
      const { past, song, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ song: prev, past: past.slice(0, -1), future: [song, ...future] });
      saveCurrentSong(prev);
    },
    redo: () => {
      const { past, song, future } = get();
      if (!future.length) return;
      set({ song: future[0], past: [...past, song], future: future.slice(1) });
      saveCurrentSong(future[0]);
    },

    setScreen: (screen) => set({ screen }),
    newProgression: ({ chordCount }) => {
      const song = get().song;
      const tuning = get().tuning();
      const roll = song.sketch.roll + 1;
      const key = pickKey(tuning, createRng(hashSeed(song.seed, 'key', song.sketch.id, roll)));
      const fresh = newSketch();
      const sketch: Section = {
        ...song.sketch,
        spice: fresh.spice,
        openFreq: fresh.openFreq,
        chordCount,
        anchor: 'auto',
        roll,
        chords: [],
      };
      set({ editingIndex: null, screen: 'sketch' });
      regenerateSketch({ ...song, key, sketch });
    },
    setMode: (mode) => get().setKey({ ...get().song.key, mode }),
    generateSketch: () => {
      const song = get().song;
      regenerateSketch({ ...song, sketch: { ...song.sketch, roll: song.sketch.roll + 1 } });
    },
    updateSketch: (patch, regen = true) => {
      const song = get().song;
      const next = { ...song, sketch: { ...song.sketch, ...patch } };
      if (regen) regenerateSketch(next);
      else get().commit(next);
    },
    keepSketch: (type, mode, replaceIndex) => {
      const song = get().song;
      const tuning = get().tuning();
      const { sketch } = song;
      const replacing = mode === 'replace' && replaceIndex !== undefined ? song.sections[replaceIndex] : undefined;
      const placed: Section = {
        ...sketch,
        id: replacing?.id ?? newId(),
        type,
        name: replacing && replacing.type === type ? replacing.name : nextSectionName(song, type),
        keyOverride: sectionKey(song, sketch),
        variationOf: undefined,
        variationMode: undefined,
        chordCount: sketch.chords.length,
        chords: sketch.chords.map((c) => ({ ...c, locked: false })),
      };
      const sections = replacing
        ? song.sections.map((s, i) => (i === replaceIndex ? placed : s))
        : [...song.sections, placed];
      const next: Song = { ...song, sections };
      // Variations of a replaced section follow their new source.
      next.sections.forEach((s, i) => {
        if (replacing && s.variationOf === placed.id) next.sections[i] = generateSection(next, i, tuning, get().exposure);
      });
      set({ editingIndex: null, placedAs: placed.name });
      get().commit(next);
    },
    editInSketch: (index) => {
      const song = get().song;
      const src = song.sections[index];
      const key = sectionKey(song, src);
      const sketch: Section = {
        ...src,
        id: song.sketch.id,
        name: 'Sketch',
        type: 'custom',
        keyOverride: undefined,
        variationOf: undefined,
        variationMode: undefined,
        chordCount: src.chords.length,
        chords: src.chords.map((c) => ({ ...c, locked: false })),
      };
      set({ editingIndex: index, placedAs: null, screen: 'sketch' });
      get().commit({ ...song, key, sketch });
    },
    newSongClean: () => {
      const cur = get().song;
      const s = freshSong(cur.tuningId, {
        key: cur.key,
        novelty: cur.novelty,
        maxStretch: cur.maxStretch,
        bpm: cur.bpm,
        loop: cur.loop,
        click: cur.click,
        contrast: cur.contrast,
      });
      const sketch = newSketch({ chordCount: cur.sketch.chordCount });
      set({ editingIndex: null, placedAs: null, screen: 'start' });
      get().commit({ ...s, sketch });
    },
    updateSong: (patch) => {
      const next = { ...get().song, ...patch };
      if ('maxStretch' in patch) regenerateSketch(next);
      else get().commit(next);
    },
    setKey: (key) => regenerateSketch({ ...get().song, key }),
    setTuning: (id) => {
      const prevTuning = get().tuning();
      const tuning = tuningsOf(get().library).find((t) => t.id === id) ?? DROP_C_6;
      // Move everything with the open low string (C idea on Drop C becomes A on Drop A), then re-voice.
      let d = mod12(lowStringPc(tuning) - lowStringPc(prevTuning));
      if (d > 6) d -= 12;
      const cur = get().song;
      const song: Song = { ...cur, tuningId: id, key: transposeKey(cur.key, d) };
      const rng = createRng(song.seed);
      const revoice = (s: Section): Section => {
        const moved: Section = {
          ...s,
          keyOverride: s.keyOverride && transposeKey(s.keyOverride, d),
          chords: s.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, d) })),
        };
        const frets = voiceInOrder(tuning, moved.chords.map((c) => c.chord), song, moved, get().exposure, rng);
        return { ...moved, chords: moved.chords.map((c, i) => ({ ...c, frets: frets[i] })) };
      };
      const next: Song = { ...song, sketch: revoice(song.sketch), sections: song.sections.map(revoice) };
      set({ exposure: bumpExposure(get().exposure, tuning, next) });
      get().commit(next);
    },
    removeSection: (index) => {
      const song = get().song;
      const removed = song.sections[index];
      const sections = song.sections
        .filter((_, i) => i !== index)
        .map((s) => (s.variationOf === removed.id ? { ...s, variationOf: undefined, variationMode: undefined } : s));
      const ei = get().editingIndex;
      set({ editingIndex: ei === null || ei === index ? null : ei > index ? ei - 1 : ei });
      get().commit({ ...song, sections });
    },
    moveSection: (index, dir) => {
      const song = get().song;
      const j = index + dir;
      if (j < 0 || j >= song.sections.length) return;
      const sections = [...song.sections];
      [sections[index], sections[j]] = [sections[j], sections[index]];
      const ei = get().editingIndex;
      set({ editingIndex: ei === index ? j : ei === j ? index : ei });
      get().commit({ ...song, sections });
    },
    duplicateAsVariation: (index) => {
      const song = get().song;
      const src = song.sections[index];
      const copy: Section = {
        ...src,
        id: newId(),
        name: nextSectionName(song, src.type),
        variationOf: src.variationOf ?? src.id,
        variationMode: 'newEnding',
        roll: 0,
        chords: [],
      };
      const sections = [...song.sections];
      sections.splice(index + 1, 0, copy);
      const ei = get().editingIndex;
      if (ei !== null && ei > index) set({ editingIndex: ei + 1 });
      regenerate({ ...song, sections }, index + 1);
    },

    toggleLock: (target, ci) =>
      get().commit(
        withSection(target, (s) => ({
          ...s,
          chords: s.chords.map((c, i) => (i === ci ? { ...c, locked: !c.locked } : c)),
        })),
      ),
    moveChordTo: (target, from, to) => {
      const sec = sectionOf(get().song, target);
      if (from === to || from < 0 || to < 0 || from >= sec.chords.length || to >= sec.chords.length) return;
      get().commit(
        withSection(target, (s) => {
          const chords = [...s.chords];
          const [moved] = chords.splice(from, 1);
          chords.splice(to, 0, moved);
          return { ...s, chords };
        }),
      );
    },
    makeHomeChord: (ci) => {
      const song = get().song;
      const tuning = get().tuning();
      const { sketch } = song;
      const item = sketch.chords[ci];
      if (!item) return;
      const roll = sketch.roll + 1;
      const key = homeKey(item.chord, createRng(hashSeed(song.seed, 'home', roll)));
      const home = { ...item, chord: { ...item.chord, degree: 0 }, locked: true };
      const rest = sketch.chords.filter((_, i) => i !== ci);
      // Generate with the home chord pinned first, even if locked chords normally float.
      const pinned: Section = { ...sketch, roll, floatLocks: false, chords: [home, ...rest] };
      const next: Song = { ...song, key, sketch: pinned };
      const generated = { ...generateSketch(next, tuning, get().exposure), floatLocks: sketch.floatLocks };
      const done = { ...next, sketch: generated };
      set({ exposure: bumpExposure(get().exposure, tuning, done, song), placedAs: null });
      get().commit(done);
    },
    swapChord: (target, ci, chord) => {
      const song = get().song;
      const tuning = get().tuning();
      const sec = sectionOf(song, target);
      const prev = sec.chords[ci - 1]?.frets;
      const frets = voiceChord(tuning, chord, voicingPrefs(song, sec, prev), get().exposure, createRng(Date.now()));
      const next = withSection(target, (s) => ({
        ...s,
        chords: s.chords.map((c, i) => (i === ci ? { chord: { ...chord, source: 'manual' as const }, frets, locked: true } : c)),
      }));
      set({ exposure: bumpExposure(get().exposure, tuning, next, song) });
      get().commit(next);
    },
    shuffleChord: (target, ci) => {
      const song = get().song;
      const tuning = get().tuning();
      const sec = sectionOf(song, target);
      if (!sec.chords[ci]) return;
      const rng = createRng(hashSeed(song.seed, 'shuffle', ci, Date.now()));
      const item = rerollChord(song, sec, ci, tuning, get().exposure, rng);
      const next = withSection(target, (s) => ({ ...s, chords: s.chords.map((c, i) => (i === ci ? item : c)) }));
      set({ exposure: bumpExposure(get().exposure, tuning, next, song) });
      get().commit(next);
    },
    toggleExtension: (target, ci, interval) => {
      const song = get().song;
      const tuning = get().tuning();
      const sec = sectionOf(song, target);
      const item = sec.chords[ci];
      if (!item) return;
      const chord = toggleAdd(item.chord, interval);
      // Add the note around the shape already under the hand; don't jump up or down the neck.
      const frets = stayInPosition(tuning, chord, item.frets, song.maxStretch);
      if (!frets) return;
      // Keep the extended chord through New.
      const next = withSection(target, (s) => ({
        ...s,
        chords: s.chords.map((c, i) => (i === ci ? { chord, frets, locked: true } : c)),
      }));
      set({ exposure: bumpExposure(get().exposure, tuning, next, song) });
      get().commit(next);
    },
    setFrets: (target, ci, frets) => {
      const song = get().song;
      const tuning = get().tuning();
      const next = withSection(target, (s) => ({
        ...s,
        chords: s.chords.map((c, i) => (i === ci ? { ...c, frets } : c)),
      }));
      set({ exposure: bumpExposure(get().exposure, tuning, next, song) });
      get().commit(next);
    },

    saveSongToLibrary: () => {
      const song = get().song;
      const songs = [song, ...get().library.songs.filter((s) => s.id !== song.id)];
      saveSongs(songs);
      set({ library: { ...get().library, songs } });
    },
    loadSong: (id) => {
      const s = get().library.songs.find((x) => x.id === id);
      if (s) {
        set({ editingIndex: null, placedAs: null, screen: s.sections.length ? 'song' : 'sketch' });
        get().commit(fitSong(normalizeSong(s), get().tuning(), get().exposure));
      }
    },
    deleteSong: (id) => {
      const songs = get().library.songs.filter((s) => s.id !== id);
      saveSongs(songs);
      set({ library: { ...get().library, songs } });
    },
    saveFavorite: (target, name) => {
      const song = get().song;
      const s = sectionOf(song, target);
      const key = sectionKey(song, s);
      const fav: FavoriteProgression = {
        id: newId(),
        name,
        savedAt: Date.now(),
        tuningId: song.tuningId,
        section: {
          type: s.type,
          spice: s.spice,
          families: s.families,
          openFreq: s.openFreq,
          keyOverride: s.keyOverride,
          anchor: s.anchor,
          anchorString: s.anchorString,
        },
        keyTonic: key.tonic,
        keyMode: key.mode,
        chords: s.chords,
      };
      const favorites = [fav, ...get().library.favorites];
      saveFavorites(favorites);
      set({ library: { ...get().library, favorites } });
    },
    loadFavoriteIntoSketch: (favId) => {
      const fav = get().library.favorites.find((f) => f.id === favId);
      if (!fav) return;
      const song = get().song;
      const tuning = get().tuning();
      const base: Section = {
        ...song.sketch,
        spice: fav.section.spice,
        families: fav.section.families,
        openFreq: fav.section.openFreq,
        anchor: fav.section.anchor ?? song.sketch.anchor,
        anchorString: fav.section.anchorString,
        chordCount: fav.chords.length,
        keyOverride: undefined,
      };
      const sameTuning = fav.tuningId === song.tuningId;
      const frets = sameTuning
        ? fav.chords.map((c) => c.frets)
        : voiceInOrder(tuning, fav.chords.map((c) => c.chord), song, base, get().exposure, createRng(Date.now()));
      const sketch = fitSection(
        { ...base, chords: fav.chords.map((c, i) => ({ chord: simplifyChord(c.chord), frets: frets[i], locked: false })) },
        song,
        tuning,
        get().exposure,
      );
      set({ editingIndex: null, placedAs: null, screen: 'sketch' });
      get().commit({ ...song, key: { tonic: fav.keyTonic, mode: fav.keyMode as Key['mode'] }, sketch });
    },
    deleteFavorite: (id) => {
      const favorites = get().library.favorites.filter((f) => f.id !== id);
      saveFavorites(favorites);
      set({ library: { ...get().library, favorites } });
    },
    importLibrary: (data) => {
      const cur = get().library;
      const merge = <T extends { id: string }>(a: T[], b: T[]) => [...b, ...a.filter((x) => !b.some((y) => y.id === x.id))];
      const library: LibraryData = {
        songs: merge(cur.songs, data.songs),
        favorites: merge(cur.favorites, data.favorites),
        customTunings: merge(cur.customTunings, data.customTunings),
      };
      saveSongs(library.songs);
      saveFavorites(library.favorites);
      saveCustomTunings(library.customTunings);
      set({ library });
    },

    addTuning: (t) => {
      const customTunings = [...get().library.customTunings.filter((x) => x.id !== t.id), t];
      saveCustomTunings(customTunings);
      set({ library: { ...get().library, customTunings } });
    },
    deleteTuning: (id) => {
      const customTunings = get().library.customTunings.filter((x) => x.id !== id);
      saveCustomTunings(customTunings);
      set({ library: { ...get().library, customTunings } });
      if (get().song.tuningId === id) get().setTuning(DROP_C_6.id);
    },
    setPlaying: (p) => set({ playing: p }),
    togglePlay: (id) => {
      if (get().playback === id) {
        get().stop();
        return;
      }
      const { song } = get();
      const rows: { target: ChordTarget; section: Section }[] =
        id === 'song'
          ? song.sections.map((section, i) => ({ target: i, section }))
          : id === 'sketch'
            ? [{ target: 'sketch', section: song.sketch }]
            : song.sections.flatMap((section, i) => (section.id === id ? [{ target: i, section }] : []));
      const steps = rows.flatMap((r) => r.section.chords.map((c, ci) => ({ target: r.target, chord: ci, frets: c.frets })));
      if (!steps.length) return;
      void playSequence(
        get().tuning(),
        steps.map((x) => x.frets),
        { bpm: song.bpm, loop: song.loop, click: song.click },
        (i) => {
          if (i === null) set({ playing: null, playback: null });
          else set({ playing: { target: steps[i].target, chord: steps[i].chord } });
        },
      );
      set({ playback: id });
    },
    stop: () => {
      stopPlayback();
      set({ playing: null, playback: null });
    },
  };
});
