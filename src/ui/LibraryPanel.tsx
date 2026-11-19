import { useRef, useState } from 'react';
import { useStore } from '../store';
import { chordSymbol } from '../theory/chords';
import { downloadFile, exportBackup, parseBackup } from '../storage/storage';

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const { songs, favorites } = s.library;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const onImport = async (file: File) => {
    try {
      s.importLibrary(parseBackup(await file.text()));
      setMsg('Backup imported.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Library">
        <header className="drawer-head">
          <h2>Library</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-section">
          <div className="row">
            <h3>Songs</h3>
            <div className="spacer" />
            <button className="btn primary" onClick={() => s.saveSongToLibrary()}>
              Save current song
            </button>
          </div>
          {songs.length === 0 && <p className="muted">No saved songs yet.</p>}
          {songs.map((song) => (
            <div key={song.id} className="list-item">
              <div>
                <b>{song.name}</b>
                <small>
                  {song.sections.length} sections · {song.sections.map((x) => x.name).join(', ')}
                </small>
              </div>
              <button className="btn" onClick={() => { s.loadSong(song.id); onClose(); }}>
                Open
              </button>
              <button className="btn danger" onClick={() => s.deleteSong(song.id)} aria-label={`Delete ${song.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="drawer-section">
          <div className="row">
            <h3>Favorite progressions</h3>
          </div>
          {favorites.length === 0 && <p className="muted">Save the sketch with ♥, or a section from its ⋯ menu.</p>}
          {favorites.map((f) => (
            <div key={f.id} className="list-item">
              <div>
                <b>{f.name}</b>
                <small>{f.chords.map((c) => chordSymbol(c.chord, true)).join(' → ')}</small>
              </div>
              <button
                className="btn"
                onClick={() => {
                  s.loadFavoriteIntoSketch(f.id);
                  onClose();
                }}
              >
                Load into sketch
              </button>
              <button className="btn danger" onClick={() => s.deleteFavorite(f.id)} aria-label={`Delete ${f.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="drawer-section">
          <h3>Backup</h3>
          <div className="row">
            <button
              className="btn"
              onClick={() =>
                downloadFile(
                  `prog-chord-library-${new Date().toISOString().slice(0, 10)}.json`,
                  exportBackup(s.library),
                  'application/json',
                )
              }
            >
              Export JSON
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
          </div>
          {msg && <p className="muted">{msg}</p>}
        </div>
      </aside>
    </div>
  );
}
