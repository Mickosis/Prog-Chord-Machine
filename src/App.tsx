import { useEffect, useState } from 'react';
import { useStore } from './store';
import { LibraryPanel } from './ui/LibraryPanel';
import { MenuSheet, type Panel } from './ui/MenuSheet';
import { SettingsDrawer } from './ui/SettingsDrawer';
import { SketchScreen } from './ui/SketchScreen';
import { SongScreen } from './ui/SongScreen';
import { StartScreen } from './ui/StartScreen';
import { TuningEditor } from './ui/TuningEditor';

export default function App() {
  const screen = useStore((s) => s.screen);
  const hasSketch = useStore((s) => s.song.sketch.chords.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const openMenu = () => setMenu(true);
  const current = screen === 'sketch' && !hasSketch ? 'start' : screen;

  return (
    <div className="app">
      {current === 'start' && <StartScreen onMenu={openMenu} />}
      {current === 'sketch' && <SketchScreen onMenu={openMenu} />}
      {current === 'song' && <SongScreen onMenu={openMenu} />}

      {menu && <MenuSheet onClose={() => setMenu(false)} onPanel={setPanel} />}
      {panel === 'library' && <LibraryPanel onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsDrawer onClose={() => setPanel(null)} onEditTunings={() => setPanel('tunings')} />}
      {panel === 'tunings' && <TuningEditor onClose={() => setPanel(null)} />}
    </div>
  );
}
