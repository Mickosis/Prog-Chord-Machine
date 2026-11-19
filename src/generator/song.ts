import { diatonicQualities, type Chord } from '../theory/chords';
import { mod12 } from '../theory/notes';
import { MODE_IDS, MODE_WEIGHTS, MODES, type Key } from '../theory/scales';
import { sectionKey, type Section, type Song, type SongChord, type Spice } from '../song/model';
import { lowStringPc, type Tuning } from '../tuning/tuning';
import { pickVoicing, rankVoicings, type Exposure, type VoicingPrefs } from '../voicing/select';
import type { Frets } from '../voicing/solver';
import { generateProgression } from './progression';
import { createRng, hashSeed, type Rng } from './rng';

/** How strongly open top strings ringing over fretted notes are favoured. */
const OPEN_HIGH = 0.8;

export function voicingPrefs(song: Song, section: Section, prevFrets?: Frets): VoicingPrefs {
  return {
    openFreq: section.openFreq,
    maxStretch: song.maxStretch,
    novelty: song.novelty,
    anchorString: section.anchorString,
    prevFrets,
    openHigh: OPEN_HIGH,
  };
}

/** True when the open low string's note works as a chord root in the key (a chug chord is possible). */
export function hasChugChord(key: Key, lowPc: number): boolean {
  const steps = MODES[key.mode].steps;
  const d = steps.findIndex((st) => mod12(key.tonic + st) === lowPc);
  return d >= 0 && diatonicQualities(key, d).some((q) => q === '5' || q === 'maj' || q === 'min');
}

/**
 * The key for a new progression: a mode weighted toward prog favourites, and
 * any tonic whose scale has a usable chord on the open low string.
 */
export function pickKey(tuning: Tuning, rng: Rng): Key {
  const mode = rng.weighted(MODE_IDS, (m) => MODE_WEIGHTS[m]);
  const low = lowStringPc(tuning);
  const tonics = Array.from({ length: 12 }, (_, t) => t).filter((t) => hasChugChord({ tonic: t, mode }, low));
  return { tonic: rng.pick(tonics), mode };
}

/** Guitar strings (1 = highest) the bass can be anchored to: the lowest three, four on 7+ strings. */
export function anchorChoices(tuning: Tuning): number[] {
  const n = tuning.strings.length;
  const count = Math.min(n >= 7 ? 4 : 3, n - 2);
  return Array.from({ length: count }, (_, i) => n - i);
}

/** Resolve a section's anchor setting to a concrete guitar string for this generate. */
export function resolveAnchor(section: Section, tuning: Tuning, rng: Rng): number {
  const choices = anchorChoices(tuning);
  if (section.anchor !== 'auto' && choices.includes(section.anchor)) return section.anchor;
  // Auto: the lowest string gets a bigger share (riff-friendly), the rest split evenly.
  const low = 0.4;
  const lowest = tuning.strings.length;
  return rng.weighted(choices, (c) => (c === lowest ? low : (1 - low) / (choices.length - 1)));
}

/** Voice chords left to right, each one near the previous shape. Given frets are kept. */
export function voiceInOrder(
  tuning: Tuning,
  chords: Chord[],
  song: Song,
  section: Section,
  exposure: Exposure,
  rng: Rng,
  keep: (Frets | undefined)[] = [],
): Frets[] {
  const out: Frets[] = [];
  chords.forEach((chord, i) => {
    out.push(keep[i] ?? voiceChord(tuning, chord, voicingPrefs(song, section, out[i - 1]), exposure, rng));
  });
  return out;
}

export function voiceChord(
  tuning: Tuning,
  chord: Chord,
  prefs: VoicingPrefs,
  exposure: Exposure,
  rng: Rng,
): Frets {
  // A chord rooted on the open low string's note is the chug chord: play it on that open string.
  const chug = chord.bass === undefined && chord.root === lowStringPc(tuning);
  const p = chug ? { ...prefs, chug: true, anchorString: undefined } : prefs;
  const ranked = rankVoicings(tuning, chord, p, exposure);
  const v = pickVoicing(ranked, tuning, p, exposure, rng);
  return v ? v.frets : tuning.strings.map(() => null);
}

/** Effective spice: the bridge gets an extra notch when contrast is on. */
function effectiveSpice(song: Song, section: Section): Spice {
  const spice = section.spice;
  if (song.contrast && section.type === 'bridge' && !section.variationOf) {
    return Math.min(3, spice + 1) as Spice;
  }
  return spice;
}

/**
 * Where each locked chord goes on regenerate (from index -> to index). In place
 * by default; with floatLocks they land in new random slots, so a chord you
 * like gets tried at different points of the progression.
 */
export function lockedSlots(section: Section, count: number, rng: Rng): Map<number, number> {
  const from = section.chords.flatMap((c, i) => (c.locked && i < count ? [i] : []));
  const out = new Map<number, number>();
  if (!section.floatLocks || from.length === 0 || from.length >= count) {
    for (const i of from) out.set(i, i);
    return out;
  }
  const shuffle = () => {
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots.slice(0, from.length);
  };
  // Prefer a layout that actually moves something.
  let to = shuffle();
  for (let tries = 0; tries < 4 && to.every((t, k) => t === from[k]); tries++) to = shuffle();
  from.forEach((f, k) => out.set(f, to[k]));
  return out;
}

/**
 * Generate (or regenerate) one section. Locked chords are kept; variations
 * derive from their source section, which must already be generated.
 */
export function generateSection(
  song: Song,
  index: number,
  tuning: Tuning,
  exposure: Exposure,
): Section {
  const section = song.sections[index];
  const key = sectionKey(song, section);
  const rng = createRng(hashSeed(song.seed, section.id, section.roll));
  const source = section.variationOf
    ? song.sections.find((s) => s.id === section.variationOf && s.chords.length > 0)
    : undefined;

  const count = source ? source.chords.length : section.chordCount;
  if (source && section.variationMode === 'copy') {
    return {
      ...section,
      anchorString: source.anchorString,
      chords: source.chords.map((c) => ({ ...c, locked: false })),
    };
  }
  // Variations stay on their source's string so the shapes connect.
  const anchorString = source?.anchorString ?? resolveAnchor(section, tuning, rng);
  const anchored: Section = { ...section, anchorString };

  const locked: (Chord | undefined)[] = [];
  const keepFrets: (Frets | undefined)[] = [];
  const slots = lockedSlots(section, count, rng);
  slots.forEach((to, from) => {
    locked[to] = section.chords[from].chord;
    keepFrets[to] = section.chords[from].frets;
  });
  if (source && section.variationMode === 'newEnding') {
    const keepN = Math.ceil(count / 2);
    for (let i = 0; i < keepN; i++) {
      if (!locked[i]) {
        locked[i] = source.chords[i].chord;
        keepFrets[i] = source.chords[i].frets;
      }
    }
  }

  const avoidFirstRoots = song.contrast
    ? song.sections
        .filter((s) => s.type !== section.type && s.chords.length > 0 && !s.variationOf && s.id !== section.id)
        .map((s) => s.chords[0].chord.root)
    : [];

  const chords = generateProgression(
    {
      key,
      type: section.type,
      chordCount: count,
      spice: effectiveSpice(song, section),
      locked,
      avoidFirstRoots,
      chugPc: lowStringPc(tuning),
      keepRoots: source && section.variationMode === 'recolor' ? source.chords.map((c) => c.chord) : undefined,
    },
    rng,
  );

  const frets = voiceInOrder(tuning, chords, song, anchored, exposure, rng, keepFrets);
  return {
    ...anchored,
    chords: chords.map((chord, i) => ({ chord, frets: frets[i], locked: [...slots.values()].includes(i) })),
  };
}

/**
 * Generate the sketch. It is treated as one more section after the
 * arrangement, so contrast rules see the placed sections.
 */
export function generateSketch(song: Song, tuning: Tuning, exposure: Exposure): Section {
  const sketch = { ...song.sketch, variationOf: undefined, variationMode: undefined };
  const temp: Song = { ...song, sections: [...song.sections, sketch] };
  return generateSection(temp, temp.sections.length - 1, tuning, exposure);
}

/** Order sections so variation sources come first. */
function generationOrder(song: Song): number[] {
  const idx = song.sections.map((_, i) => i);
  return [...idx.filter((i) => !song.sections[i].variationOf), ...idx.filter((i) => song.sections[i].variationOf)];
}

export function generateSong(song: Song, tuning: Tuning, exposure: Exposure, onlyIndex?: number): Song {
  const next: Song = { ...song, sections: song.sections.map((s) => ({ ...s })) };
  const order = generationOrder(next);
  const targetId = onlyIndex !== undefined ? next.sections[onlyIndex].id : undefined;
  for (const i of order) {
    const s = next.sections[i];
    const isTarget = targetId === undefined || s.id === targetId;
    // Variations of a regenerated section follow it.
    const followsTarget = targetId !== undefined && s.variationOf === targetId;
    if (!isTarget && !followsTarget) continue;
    next.sections[i] = generateSection(next, i, tuning, exposure);
  }
  return next;
}

const sameChord = (a: Chord, b: Chord) =>
  a.root === b.root && a.quality === b.quality && a.bass === b.bass;

/**
 * A new random chord for one slot. The other chords stay as they are and steer
 * the pick (it follows the chord before it), and the result always differs
 * from the chord it replaces and from its neighbours when possible.
 */
export function rerollChord(song: Song, section: Section, index: number, tuning: Tuning, exposure: Exposure, rng: Rng): SongChord {
  const key = sectionKey(song, section);
  const current = section.chords[index].chord;
  const neighbours = [section.chords[index - 1]?.chord, section.chords[index + 1]?.chord].filter((c): c is Chord => !!c);
  const locked = section.chords.map((c, i) => (i === index ? undefined : c.chord));
  // Only ask for a chug chord when no other chord already is one.
  const low = lowStringPc(tuning);
  const hasChug = section.chords.some((c, i) => i !== index && c.chord.root === low && c.chord.bass === undefined);
  let pick: Chord | undefined;
  for (let tries = 0; tries < 12; tries++) {
    const chord = generateProgression(
      {
        key,
        type: section.type,
        chordCount: section.chords.length,
        spice: effectiveSpice(song, section),
        locked,
        avoidFirstRoots: [],
        chugPc: hasChug ? undefined : low,
      },
      rng,
    )[index];
    if (sameChord(chord, current)) continue;
    pick = chord;
    if (!neighbours.some((n) => sameChord(n, chord))) break;
  }
  const chord = pick ?? current;
  const frets = voiceChord(tuning, chord, voicingPrefs(song, section, section.chords[index - 1]?.frets), exposure, rng);
  return { chord, frets, locked: section.chords[index].locked };
}
