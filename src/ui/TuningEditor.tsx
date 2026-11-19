import { useState } from 'react';
import { newId } from '../song/model';
import { useStore } from '../store';
import { midiName, parseMidi } from '../theory/notes';
import { tuningLabel, validateTuning, type Tuning } from '../tuning/tuning';

// E0..C5 is plenty for 4–9 string guitars and basses.
const NOTE_OPTIONS = Array.from({ length: 61 }, (_, i) => 16 + i);

export function TuningEditor({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [draft, setDraft] = useState<Tuning>({
    id: newId(),
    name: 'Drop B (7-string)',
    strings: ['B1', 'F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4'].map(parseMidi),
  });
  const error = validateTuning(draft);
  const custom = s.library.customTunings;

  const setString = (i: number, midi: number) =>
    setDraft({ ...draft, strings: draft.strings.map((m, j) => (j === i ? midi : m)) });

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Tunings">
        <header className="drawer-head">
          <h2>Tunings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="drawer-section">
          <h3>Custom tunings</h3>
          {custom.length === 0 && <p className="muted">Drop C and Drop A are built in.</p>}
          {custom.map((t) => (
            <div key={t.id} className="list-item">
              <div>
                <b>{t.name}</b>
                <small>{tuningLabel(t)}</small>
              </div>
              <button className="btn" onClick={() => s.setTuning(t.id)}>
                Use
              </button>
              <button className="btn danger" onClick={() => s.deleteTuning(t.id)} aria-label={`Delete ${t.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="drawer-section">
          <h3>New tuning</h3>
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <p className="muted">Lowest string first.</p>
          <div className="string-list">
            {draft.strings.map((m, i) => (
              <label key={i} className="field inline">
                <span>String {draft.strings.length - i}</span>
                <select value={m} onChange={(e) => setString(i, Number(e.target.value))}>
                  {NOTE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {midiName(n)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={() => setDraft({ ...draft, strings: [draft.strings[0] - 5, ...draft.strings] })}
            >
              + Low string
            </button>
            <button
              className="btn"
              disabled={draft.strings.length <= 4}
              onClick={() => setDraft({ ...draft, strings: draft.strings.slice(1) })}
            >
              − Low string
            </button>
            <div className="spacer" />
            <button
              className="btn primary"
              disabled={Boolean(error)}
              onClick={() => {
                s.addTuning(draft);
                s.setTuning(draft.id);
                setDraft({ ...draft, id: newId() });
              }}
            >
              Save & use
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </aside>
    </div>
  );
}
