import { Midi } from '@tonejs/midi';
import type { Song } from '../song/model';
import type { Tuning } from '../tuning/tuning';

/** Whole song, one chord per 4/4 bar. Section names become markers. */
export function songToMidi(song: Song, tuning: Tuning): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(song.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.name = song.name;
  const track = midi.addTrack();
  track.name = 'Chords';
  const bar = (4 * 60) / song.bpm;
  let t = 0;
  for (const section of song.sections) {
    midi.header.meta.push({ type: 'marker', text: section.name, ticks: midi.header.secondsToTicks(t) });
    for (const c of section.chords) {
      c.frets.forEach((f, i) => {
        if (f === null) return;
        track.addNote({ midi: tuning.strings[i] + f, time: t + i * 0.012, duration: bar * 0.95, velocity: 0.8 });
      });
      t += bar;
    }
  }
  return midi.toArray();
}
