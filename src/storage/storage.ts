import type { Section, Song, SongChord } from '../song/model';
import type { Tuning } from '../tuning/tuning';
import { emptyExposure, type Exposure } from '../voicing/select';

const PREFIX = 'prog-chord-library:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — ignore */
  }
}

export interface FavoriteProgression {
  id: string;
  name: string;
  savedAt: number;
  tuningId: string;
  section: Pick<Section, 'type' | 'spice' | 'families' | 'openFreq' | 'keyOverride'> &
    Partial<Pick<Section, 'anchor' | 'anchorString'>>;
  keyTonic: number;
  keyMode: string;
  chords: SongChord[];
}

export interface LibraryData {
  songs: Song[];
  favorites: FavoriteProgression[];
  customTunings: Tuning[];
}

export const loadLibrary = (): LibraryData => ({
  songs: read<Song[]>('songs', []),
  favorites: read<FavoriteProgression[]>('favorites', []),
  customTunings: read<Tuning[]>('tunings', []),
});

export const saveSongs = (songs: Song[]) => write('songs', songs);
export const saveFavorites = (f: FavoriteProgression[]) => write('favorites', f);
export const saveCustomTunings = (t: Tuning[]) => write('tunings', t);

export const loadExposure = (): Exposure => read<Exposure>('exposure', emptyExposure());
export const saveExposure = (e: Exposure) => write('exposure', e);

export const loadCurrentSong = (): Song | null => read<Song | null>('current-v2', null);
export const saveCurrentSong = (s: Song) => write('current-v2', s);

const BACKUP_VERSION = 1;

export function exportBackup(lib: LibraryData): string {
  return JSON.stringify({ app: 'prog-chord-library', version: BACKUP_VERSION, ...lib }, null, 2);
}

export function parseBackup(text: string): LibraryData {
  const data = JSON.parse(text);
  if (data?.app !== 'prog-chord-library') throw new Error('Not a Prog Chord Library backup file');
  return {
    songs: Array.isArray(data.songs) ? data.songs : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    customTunings: Array.isArray(data.customTunings) ? data.customTunings : [],
  };
}

export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
