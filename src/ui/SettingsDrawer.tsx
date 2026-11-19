import { useStore } from '../store';

/** Rarely-touched settings, out of the way of generating. */
export function SettingsDrawer({ onClose, onEditTunings }: { onClose: () => void; onEditTunings: () => void }) {
  const s = useStore();
  const { song } = s;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Settings">
        <header className="drawer-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-section">
          <h3>Playback</h3>
          <label className="field">
            <span>BPM</span>
            <input
              type="number"
              min={40}
              max={240}
              value={song.bpm}
              onChange={(e) => s.updateSong({ bpm: Math.min(240, Math.max(40, Number(e.target.value) || 120)) })}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={song.loop} onChange={(e) => s.updateSong({ loop: e.target.checked })} />
            Loop
          </label>
          <label className="check">
            <input type="checkbox" checked={song.click} onChange={(e) => s.updateSong({ click: e.target.checked })} />
            Metronome click
          </label>
        </div>

        <div className="drawer-section">
          <h3>Shapes</h3>
          <label className="field" title="How hard to push you toward shapes you haven't seen yet">
            <span>Novelty</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={song.novelty}
              onChange={(e) => s.updateSong({ novelty: Number(e.target.value) })}
            />
            <b>{Math.round(song.novelty * 100)}%</b>
          </label>
          <label className="field">
            <span>Max stretch</span>
            <input
              type="number"
              min={3}
              max={6}
              value={song.maxStretch}
              onChange={(e) => s.updateSong({ maxStretch: Math.min(6, Math.max(3, Number(e.target.value))) })}
            />
            <small className="muted">frets</small>
          </label>
        </div>

        <div className="drawer-section">
          <h3>Tunings</h3>
          <button className="btn" onClick={onEditTunings}>
            Edit tunings…
          </button>
        </div>
      </aside>
    </div>
  );
}
