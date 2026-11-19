import type { Chord } from '../theory/chords';
import type { Key } from '../theory/scales';
import type { OpenFreq } from '../voicing/select';
import { ALL_FAMILIES, type Frets, type ShapeFamily } from '../voicing/solver';

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre'
  | 'chorus'
  | 'bridge'
  | 'breakdown'
  | 'solo'
  | 'outro'
  | 'custom';

export const SECTION_TYPES: { id: SectionType; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'verse', label: 'Verse' },
  { id: 'pre', label: 'Pre-chorus' },
  { id: 'chorus', label: 'Chorus' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'solo', label: 'Solo' },
  { id: 'outro', label: 'Outro' },
  { id: 'custom', label: 'Custom' },
];

export type Spice = 0 | 1 | 2 | 3;

export const SPICE_LABELS: Record<Spice, string> = {
  0: 'Grounded',
  1: 'Modal',
  2: 'Colour',
  3: 'Out there',
};

export const LENGTHS = [3, 4, 5, 6, 8];

export type VariationMode = 'copy' | 'newEnding' | 'recolor';

export const VARIATION_LABELS: Record<VariationMode, string> = {
  copy: 'Exact repeat',
  newEnding: 'New ending',
  recolor: 'Same roots, new colours',
};

export type Anchor = 'auto' | number;

export interface SongChord {
  chord: Chord;
  frets: Frets;
  locked: boolean;
}

export interface Section {
  id: string;
  name: string;
  type: SectionType;
  chordCount: number;
  /** Chord colour level (fixed for new progressions; kept for older saves). */
  spice: Spice;
  /** Legacy: shape filters are no longer used. */
  families: ShapeFamily[];
  openFreq: OpenFreq;
  keyOverride?: Key;
  variationOf?: string;
  variationMode?: VariationMode;
  /** Bumped on each regenerate so the seed stays reproducible. */
  roll: number;
  /** Guitar string (1 = highest) the bass stays on, or pick one per generate. */
  anchor: Anchor;
  /** Regenerate moves locked chords to new slots instead of keeping them in place. */
  floatLocks?: boolean;
  /** String actually used by the last generate (resolves 'auto'). */
  anchorString?: number;
  chords: SongChord[];
}

export interface Song {
  id: string;
  name: string;
  seed: number;
  tuningId: string;
  key: Key;
  /** 0–1: how hard to push toward shapes you haven't seen. */
  novelty: number;
  maxStretch: number;
  /** Chorus/verse start on different chords, bridge gets extra colour. Always on. */
  contrast: boolean;
  bpm: number;
  /** Loop playback until stopped. */
  loop: boolean;
  /** Metronome click during playback. */
  click: boolean;
  /** The progression being worked on before it is placed in the arrangement. */
  sketch: Section;
  sections: Section[];
}

export const DEFAULT_FAMILIES: ShapeFamily[] = [...ALL_FAMILIES];

let idCounter = 0;
export const newId = (): string =>
  `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newSection(type: SectionType, overrides: Partial<Section> = {}): Section {
  const label = SECTION_TYPES.find((t) => t.id === type)?.label ?? 'Section';
  return {
    id: newId(),
    name: label,
    type,
    chordCount: type === 'breakdown' ? 3 : 4,
    spice: type === 'bridge' ? 3 : 2,
    families: [...DEFAULT_FAMILIES],
    openFreq: 'rarely',
    roll: 0,
    anchor: 'auto',
    chords: [],
    ...overrides,
  };
}

export const newSketch = (overrides: Partial<Section> = {}): Section =>
  newSection('custom', { name: 'Sketch', ...overrides });

export function newSong(tuningId: string, key: Key, seed?: number): Song {
  return {
    id: newId(),
    name: 'Untitled song',
    seed: seed ?? Math.floor(Math.random() * 1e9),
    tuningId,
    key,
    novelty: 0.6,
    maxStretch: 4,
    contrast: true,
    bpm: 120,
    loop: true,
    click: false,
    sketch: newSketch(),
    sections: [],
  };
}

/** Next free display name for a section type, e.g. "Verse 2". */
export function nextSectionName(song: Song, type: SectionType): string {
  const label = SECTION_TYPES.find((t) => t.id === type)?.label ?? 'Section';
  const n = song.sections.filter((s) => s.type === type).length;
  return n === 0 ? label : `${label} ${n + 1}`;
}

export const sectionKey = (song: Song, section: Section): Key => section.keyOverride ?? song.key;
