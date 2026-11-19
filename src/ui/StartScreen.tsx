import { LENGTHS } from '../song/model';
import { useStore } from '../store';
import { pcName } from '../theory/notes';
import { lowStringPc } from '../tuning/tuning';
import { Icon } from './Icon';
import { useState } from 'react';

/** Start: pick the guitar and how many chords, then Generate. Nothing generated underneath. */
export function StartScreen({ onMenu }: { onMenu: () => void }) {
  const s = useStore();
  const { song } = s;
  const [count, setCount] = useState(LENGTHS.includes(song.sketch.chordCount) ? song.sketch.chordCount : 4);
  const idx = LENGTHS.indexOf(count);
  const step = (d: number) => setCount(LENGTHS[Math.min(LENGTHS.length - 1, Math.max(0, idx + d))]);
  const low = pcName(lowStringPc(s.tuning()), true);
  const tunings = s.allTunings();
  const hasSketch = song.sketch.chords.length > 0;
  const sections = song.sections.length;

  return (
    <div className="screen start">
      <header className="bar">
        <span className="brand">Prog Chord Machine</span>
        <button className="round-btn" onClick={onMenu} aria-label="Menu">
          <Icon name="menu" />
        </button>
      </header>

      <div className="tuning-toggle" role="radiogroup" aria-label="Guitar">
        {tunings.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={t.id === song.tuningId}
            className={t.id === song.tuningId ? 'on' : ''}
            onClick={() => s.setTuning(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <main className="start-main">
        <span className="eyebrow" id="count-label">
          How many chords?
        </span>
        <div className="stepper" aria-labelledby="count-label">
          <button className="round-btn xl" onClick={() => step(-1)} disabled={idx === 0} aria-label="Fewer chords">
            <Icon name="minus" size={22} />
          </button>
          <output className="count" aria-live="polite">
            {count}
          </output>
          <button
            className="round-btn xl"
            onClick={() => step(1)}
            disabled={idx === LENGTHS.length - 1}
            aria-label="More chords"
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        <div className="count-bars" aria-hidden="true">
          {Array.from({ length: LENGTHS[LENGTHS.length - 1] }, (_, i) => (
            <span key={i} className={i < count ? 'on' : ''} />
          ))}
        </div>
      </main>

      <footer className="start-foot">
        <p className="hint">Dyads and triads, with at least one chord on your open low {low}.</p>
        <button className="cta" onClick={() => s.newProgression({ chordCount: count })}>
          <Icon name="regen" size={22} />
          Generate
        </button>
        {(hasSketch || sections > 0) && (
          <div className="resume">
            {hasSketch && (
              <button className="text-link" onClick={() => s.setScreen('sketch')}>
                Back to last progression
              </button>
            )}
            {sections > 0 && (
              <button className="text-link" onClick={() => s.setScreen('song')}>
                Open song ({sections} {sections === 1 ? 'section' : 'sections'})
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
