import { songToMidi } from '../export/midi';
import { VARIATION_LABELS, sectionKey } from '../song/model';
import { downloadFile } from '../storage/storage';
import { useStore } from '../store';
import { chordSymbol } from '../theory/chords';
import { keyPrefersFlats, MODES } from '../theory/scales';
import { pcName } from '../theory/notes';
import { Icon } from './Icon';

/** The song: kept progressions in order. Listen, reorder, edit one back in the sketch. */
export function SongScreen({ onMenu }: { onMenu: () => void }) {
  const s = useStore();
  const { song } = s;
  const tuning = s.tuning();
  const back = song.sketch.chords.length ? 'sketch' : 'start';

  const rename = (index: number, name: string) =>
    s.commit({ ...song, sections: song.sections.map((x, i) => (i === index ? { ...x, name } : x)) });

  return (
    <div className="screen song">
      <header className="bar">
        <button className="round-btn" onClick={() => s.setScreen(back)} aria-label={back === 'sketch' ? 'Back to progression' : 'Back to start'}>
          <Icon name="back" size={18} />
        </button>
        <input
          className="song-title"
          value={song.name}
          onChange={(e) => s.updateSong({ name: e.target.value })}
          aria-label="Song name"
        />
        <button className="round-btn" onClick={onMenu} aria-label="Menu">
          <Icon name="menu" />
        </button>
      </header>

      {song.sections.length === 0 ? (
        <main className="song-empty">
          <p className="muted">Nothing kept yet. Generate a progression and press Keep to start your song.</p>
          <button className="cta" onClick={() => s.setScreen('start')}>
            Generate
          </button>
        </main>
      ) : (
        <main className="song-list">
          {song.sections.map((section, i) => {
            const key = sectionKey(song, section);
            const flats = keyPrefersFlats(key);
            const playingThis = s.playback === section.id;
            return (
              <section key={section.id} className={`song-row type-${section.type}`}>
                <div className="song-row-head">
                  <input
                    className="section-name"
                    value={section.name}
                    onChange={(e) => rename(i, e.target.value)}
                    aria-label="Section name"
                  />
                  <span className="mono muted small">
                    {pcName(key.tonic, flats)} {MODES[key.mode].label.replace(/ \(.*\)/, '')}
                  </span>
                </div>
                {section.variationOf && (
                  <span className="muted small">
                    {VARIATION_LABELS[section.variationMode ?? 'copy']} of{' '}
                    {song.sections.find((x) => x.id === section.variationOf)?.name}
                  </span>
                )}
                <div className="song-chords">
                  {section.chords.map((c, ci) => (
                    <span
                      key={ci}
                      className={`song-chord ${s.playing?.target === i && s.playing.chord === ci ? 'playing' : ''}`}
                    >
                      {chordSymbol(c.chord, flats)}
                    </span>
                  ))}
                </div>
                <div className="song-row-actions">
                  <button className="pill" onClick={() => s.togglePlay(section.id)}>
                    <Icon name={playingThis ? 'stop' : 'play'} size={14} />
                    {playingThis ? 'Stop' : 'Play'}
                  </button>
                  <button className="pill" onClick={() => s.editInSketch(i)}>
                    Edit
                  </button>
                  <details className="more">
                    <summary className="pill" aria-label={`More actions for ${section.name}`}>
                      ⋯
                    </summary>
                    <div className="menu">
                      <button onClick={() => s.moveSection(i, -1)} disabled={i === 0}>
                        Move up
                      </button>
                      <button onClick={() => s.moveSection(i, 1)} disabled={i === song.sections.length - 1}>
                        Move down
                      </button>
                      <button onClick={() => s.duplicateAsVariation(i)}>Add variation after</button>
                      <button onClick={() => s.saveFavorite(i, `${song.name} · ${section.name}`)}>Save to library</button>
                      <button className="danger" onClick={() => s.removeSection(i)}>
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              </section>
            );
          })}
        </main>
      )}

      {song.sections.length > 0 && (
        <footer className="action-bar">
          <button
            className="pill big"
            onClick={() =>
              downloadFile(
                `${song.name.replace(/[^\w-]+/g, '_') || 'song'}.mid`,
                songToMidi(song, tuning) as BlobPart,
                'audio/midi',
              )
            }
          >
            <Icon name="download" size={16} />
            MIDI
          </button>
          <button className="play-btn" onClick={() => s.togglePlay('song')} aria-label={s.playback === 'song' ? 'Stop' : 'Play song'}>
            <Icon name={s.playback === 'song' ? 'stop' : 'play'} size={28} />
          </button>
          <button className="pill big accent" onClick={() => s.setScreen('start')}>
            New idea
          </button>
        </footer>
      )}
    </div>
  );
}
