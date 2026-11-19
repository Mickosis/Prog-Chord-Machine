import { useStore } from '../store';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

export type Panel = 'library' | 'settings' | 'tunings';

/** Everything that isn't on screen: song, library, settings, undo. */
export function MenuSheet({ onClose, onPanel }: { onClose: () => void; onPanel: (p: Panel) => void }) {
  const s = useStore();
  const { song } = s;
  const go = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const item = (icon: IconName, label: string, onClick: () => void, disabled = false) => (
    <button className="menu-item" onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
  return (
    <Sheet title="Menu" onClose={onClose}>
      <div className="menu-list">
        {item('song', `Song (${song.sections.length})`, go(() => s.setScreen('song')))}
        {item('heart', 'Library', go(() => onPanel('library')))}
        {item('settings', 'Settings', go(() => onPanel('settings')))}
        {item('undo', 'Undo', s.undo, !s.past.length)}
        {item('redo', 'Redo', s.redo, !s.future.length)}
        <label className="menu-item switch">
          <Icon name="lock" size={18} />
          Locked chords move on New
          <input
            type="checkbox"
            checked={Boolean(song.sketch.floatLocks)}
            onChange={(e) => s.updateSketch({ floatLocks: e.target.checked }, false)}
          />
        </label>
        {item('plus', 'New song', go(s.newSongClean))}
      </div>
    </Sheet>
  );
}
