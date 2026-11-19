import { useStore } from '../store';
import { pcName } from '../theory/notes';
import { keyPrefersFlats, MODES, OTHER_MODES, PROG_MODES, type ModeId } from '../theory/scales';

/** "C Phrygian ▾": shows the key and lets the mode change. The tonic is the open low string. */
export function ModeBadge() {
  const key = useStore((s) => s.song.key);
  const setMode = useStore((s) => s.setMode);
  const option = (m: ModeId) => (
    <option key={m} value={m}>
      {pcName(key.tonic, keyPrefersFlats({ ...key, mode: m }))} {MODES[m].label}
    </option>
  );
  return (
    <select
      className="mode-badge"
      value={key.mode}
      onChange={(e) => setMode(e.target.value as ModeId)}
      aria-label="Mode"
      title="Change mode (regenerates the sketch)"
    >
      <optgroup label="Prog favourites">{PROG_MODES.map(option)}</optgroup>
      <optgroup label="Others">{OTHER_MODES.map(option)}</optgroup>
    </select>
  );
}
