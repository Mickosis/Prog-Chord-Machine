import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { strum } from '../audio/player';
import { swapSuggestions } from '../generator/progression';
import { voicingPrefs } from '../generator/song';
import { sectionKey } from '../song/model';
import { useStore } from '../store';
import { chordNoteNames, chordSymbol, extensionOptions, romanNumeral, toggleAdd, type Chord } from '../theory/chords';
import { keyPrefersFlats } from '../theory/scales';
import { emptyExposure, rankVoicings } from '../voicing/select';
import { fretsLabel, solveVoicings } from '../voicing/solver';
import { ChordDiagram } from './ChordDiagram';
import { Icon } from './Icon';
import { KeepSheet } from './KeepSheet';
import { ModeBadge } from './ModeBadge';
import { Sheet } from './Sheet';

const SOURCE_LABEL: Record<Chord['source'], string> = {
  diatonic: '',
  borrowed: 'borrowed',
  mediant: 'chromatic mediant',
  tritone: 'tritone sub',
  polychord: 'polychord',
  manual: 'swapped',
};

/** Horizontal swipe distance (px) that flips to the next/previous chord. */
const SWIPE = 50;

/** The progression: chip strip on top, one big chord card, New / Play / Keep at the bottom. */
export function SketchScreen({ onMenu }: { onMenu: () => void }) {
  const s = useStore();
  const { song } = s;
  const { sketch } = song;
  const tuning = s.tuning();
  const key = sectionKey(song, sketch);
  const flats = keyPrefersFlats(key);
  const n = sketch.chords.length;
  const [focus, setFocus] = useState(0);
  const [sheet, setSheet] = useState<'swap' | 'extend' | 'keep' | null>(null);
  const [saved, setSaved] = useState(false);
  const swipeStart = useRef<number | null>(null);
  // While playing, the card follows the chord that sounds.
  const playingChord = s.playing?.target === 'sketch' ? s.playing.chord : null;
  const at = Math.min(playingChord ?? focus, Math.max(0, n - 1));
  const item = sketch.chords[at];
  const playing = s.playback === 'sketch';
  const editing = s.editingIndex !== null ? song.sections[s.editingIndex] : undefined;

  // Stable voicing order for cycling (ignores novelty so the list doesn't reshuffle).
  const prevFrets = sketch.chords[at - 1]?.frets;
  const alternatives = useMemo(() => {
    if (!item) return [];
    const prefs = { ...voicingPrefs(song, sketch, prevFrets), novelty: 0 };
    return rankVoicings(tuning, item.chord, prefs, emptyExposure());
  }, [tuning, item, song, sketch, prevFrets]);

  if (!item) return null;
  const { chord } = item;
  const label = fretsLabel(item.frets);
  const vIdx = alternatives.findIndex((v) => fretsLabel(v.frets) === label);
  const cycle = (dir: 1 | -1) => {
    if (!alternatives.length) return;
    const next = alternatives[(Math.max(vIdx, 0) + dir + alternatives.length) % alternatives.length];
    s.setFrets('sketch', at, next.frets);
    void strum(tuning, next.frets);
  };
  const go = (i: number) => setFocus(Math.min(n - 1, Math.max(0, i)));
  // Play the chord as it now stands after a shuffle or extension.
  const hearIt = () => {
    const now = useStore.getState().song.sketch.chords[at];
    if (now) void strum(tuning, now.frets);
  };
  const source = SOURCE_LABEL[chord.source];

  // Swipe the card left/right to move between chords.
  const onCardDown = (e: PointerEvent) => (swipeStart.current = e.clientX);
  const onCardUp = (e: PointerEvent) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > SWIPE) go(at + (dx < 0 ? 1 : -1));
  };

  return (
    <div className="screen sketch">
      <header className="bar">
        <button className="round-btn" onClick={() => s.setScreen('start')} aria-label="Back to start">
          <Icon name="back" size={18} />
        </button>
        <ModeBadge />
        <div className="bar-group">
          <button
            className={`round-btn ${saved ? 'on' : ''}`}
            onClick={() => {
              s.saveFavorite('sketch', `${song.name} · ${chordSymbol(sketch.chords[0].chord, flats)}…`);
              setSaved(true);
            }}
            aria-label={saved ? 'Saved to library' : 'Save to library'}
          >
            <Icon name="heart" />
          </button>
          <button className="round-btn" onClick={onMenu} aria-label="Menu">
            <Icon name="menu" />
          </button>
        </div>
      </header>

      {editing && <p className="editing-note">Editing {editing.name} · Keep to replace it</p>}

      <ChordStrip focus={at} onFocus={go} />

      <main className="deck">
        <article
          className={`deck-card ${item.locked ? 'locked' : ''}`}
          onPointerDown={onCardDown}
          onPointerUp={onCardUp}
          onPointerCancel={() => (swipeStart.current = null)}
        >
          <div className="deck-top">
            <button className="round-btn ghost" onClick={() => s.makeHomeChord(at)} aria-label="Make this the home chord">
              <Icon name="home" size={18} />
            </button>
            <span className="mono muted">
              {at + 1} of {n}
            </span>
            <button
              className={`round-btn ghost ${item.locked ? 'on' : ''}`}
              onClick={() => s.toggleLock('sketch', at)}
              aria-label={item.locked ? 'Unlock chord' : 'Lock chord'}
              aria-pressed={item.locked}
            >
              <Icon name={item.locked ? 'lock' : 'unlock'} size={18} />
            </button>
          </div>
          <h2 className="deck-symbol">{chordSymbol(chord, flats)}</h2>
          <span className="deck-numeral">
            {romanNumeral(chord, key)}
            {source && <span className="source">{source}</span>}
          </span>
          <span className="muted small">{chordNoteNames(chord, key).join(' · ')}</span>
          <button className="diagram-btn" onClick={() => void strum(tuning, item.frets)} aria-label={`Play ${chordSymbol(chord, flats)}`}>
            <ChordDiagram frets={item.frets} tuning={tuning} bassPc={chord.bass ?? chord.root} rootPc={chord.root} size={1.9} />
          </button>
          <div className="pager">
            <button className="round-btn ghost" onClick={() => cycle(-1)} aria-label="Previous voicing">
              <Icon name="back" size={16} />
            </button>
            <span className="mono muted">
              voicing {vIdx >= 0 ? vIdx + 1 : '–'} / {alternatives.length}
            </span>
            <button className="round-btn ghost" onClick={() => cycle(1)} aria-label="Next voicing">
              <Icon name="next" size={16} />
            </button>
          </div>
          <div className="card-actions">
            <button
              className="pill"
              onClick={() => {
                s.shuffleChord('sketch', at);
                hearIt();
              }}
              aria-label="Shuffle: pick a new random chord here"
            >
              <Icon name="shuffle" size={16} />
              Shuffle
            </button>
            <button className="pill" onClick={() => setSheet('swap')}>
              <Icon name="swap" size={16} />
              Swap
            </button>
            <button className={`pill ${chord.adds?.length ? 'on' : ''}`} onClick={() => setSheet('extend')}>
              <Icon name="plus" size={16} />
              Extend
            </button>
          </div>
        </article>
        {at < n - 1 && <div className="deck-peek" aria-hidden="true" />}
      </main>

      {s.placedAs ? (
        <p className="toast" role="status">
          Added as {s.placedAs}
          <button className="text-link" onClick={() => s.setScreen('song')}>
            View song
          </button>
        </p>
      ) : (
        <p className="hint">Swipe for the next chord · drag a chip to reorder</p>
      )}

      <footer className="action-bar">
        <button className="pill big" onClick={s.generateSketch} aria-label="New chords (locked chords stay)">
          <Icon name="regen" size={16} />
          New
        </button>
        <button className="play-btn" onClick={() => s.togglePlay('sketch')} aria-label={playing ? 'Stop' : 'Play progression'}>
          <Icon name={playing ? 'stop' : 'play'} size={28} />
        </button>
        <button className="pill big accent" onClick={() => setSheet('keep')}>
          Keep
        </button>
      </footer>

      {sheet === 'swap' && (
        <Sheet title={`Swap ${chordSymbol(chord, flats)} for`} onClose={() => setSheet(null)}>
          <div className="swap-grid">
            {swapSuggestions(key, sketch.spice).map((c) => (
              <button
                key={`${c.root}-${c.quality}-${c.source}`}
                className={`swap-item ${c.source}`}
                onClick={() => {
                  s.swapChord('sketch', at, c);
                  setSheet(null);
                }}
              >
                <b>{chordSymbol(c, flats)}</b>
                <small>{romanNumeral(c, key)}</small>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'extend' && (
        <Sheet title={`Extend ${chordSymbol(chord, flats)}`} onClose={() => setSheet(null)}>
          <p className="muted small sheet-note">Add notes on top of the chord. Tap again to take one out.</p>
          <div className="ext-grid">
            {extensionOptions(chord, key).map((ext) => {
              const on = chord.adds?.includes(ext.interval) ?? false;
              const result = toggleAdd(chord, ext.interval);
              const playable = on || solveVoicings(tuning, result, { maxStretch: song.maxStretch }).length > 0;
              return (
                <button
                  key={ext.label}
                  className={`swap-item ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  disabled={!playable}
                  onClick={() => {
                    s.toggleExtension('sketch', at, ext.interval);
                    hearIt();
                  }}
                >
                  <b>{ext.label}</b>
                  <small>{playable ? chordSymbol(on ? chord : result, flats) : 'no shape'}</small>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {sheet === 'keep' && <KeepSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

/** One chip per chord. Tap to show it; drag sideways to move it to another slot. */
function ChordStrip({ focus, onFocus }: { focus: number; onFocus: (i: number) => void }) {
  const s = useStore();
  const { song } = s;
  const { sketch } = song;
  const key = sectionKey(song, sketch);
  const flats = keyPrefersFlats(key);
  const n = sketch.chords.length;
  const strip = useRef<HTMLDivElement>(null);
  // The drag lives in a ref: pointerup can fire before React re-renders the last pointermove.
  const drag = useRef<{ from: number; x0: number; active: boolean; over: number | null } | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const slotAt = (clientX: number) => {
    const r = strip.current?.getBoundingClientRect();
    if (!r) return null;
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)));
  };
  const down = (i: number, e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { from: i, x0: e.clientX, active: false, over: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.abs(e.clientX - d.x0) > 8) d.active = true;
    if (d.active) {
      d.over = slotAt(e.clientX);
      setOver(d.over);
    }
  };
  const up = (i: number) => {
    const d = drag.current;
    drag.current = null;
    if (d?.active && d.over !== null && d.over !== d.from) {
      s.moveChordTo('sketch', d.from, d.over);
      onFocus(d.over);
    } else if (!d?.active) onFocus(i);
    setOver(null);
  };

  return (
    <div className="strip" role="tablist" aria-label="Chords" ref={strip} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {sketch.chords.map((c, i) => (
        <button
          key={i}
          role="tab"
          aria-selected={i === focus}
          className={`chip-tab ${i === focus ? 'on' : ''} ${c.locked ? 'locked' : ''} ${over === i ? 'over' : ''} ${
            s.playing?.target === 'sketch' && s.playing.chord === i ? 'playing' : ''
          }`}
          onPointerDown={(e) => down(i, e)}
          onPointerMove={move}
          onPointerUp={() => up(i)}
          onPointerCancel={() => {
            drag.current = null;
            setOver(null);
          }}
        >
          <span className="chip-symbol">{chordSymbol(c.chord, flats)}</span>
          {n <= 6 && <span className="chip-numeral">{romanNumeral(c.chord, key)}</span>}
        </button>
      ))}
    </div>
  );
}
