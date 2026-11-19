import { useState } from 'react';
import { nextSectionName, SECTION_TYPES, type SectionType } from '../song/model';
import { useStore } from '../store';
import { Sheet } from './Sheet';

/** "Where does this progression go?" — place the sketch in the song. */
export function KeepSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const { song, editingIndex } = s;
  const editing = editingIndex !== null ? song.sections[editingIndex] : undefined;
  const [type, setType] = useState<SectionType | null>(editing?.type ?? null);

  const place = (t: SectionType, mode: 'add' | 'replace', index?: number) => {
    s.keepSketch(t, mode, index);
    onClose();
  };
  const pick = (t: SectionType) => {
    const exists = song.sections.some((x) => x.type === t);
    if (!exists && !editing) place(t, 'add');
    else setType(t);
  };

  const matches = type ? song.sections.map((x, i) => ({ x, i })).filter(({ x }) => x.type === type) : [];
  // When editing a section of another type, still offer replacing that one.
  const replaceable =
    editing && editingIndex !== null && !matches.some((m) => m.i === editingIndex)
      ? [{ x: editing, i: editingIndex }, ...matches]
      : matches;

  return (
    <Sheet title="Keep as…" onClose={onClose}>
      <div className="type-grid">
        {SECTION_TYPES.map((t) => (
          <button key={t.id} className={`type-btn type-${t.id} ${type === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {type && (
        <div className="sheet-actions">
          {replaceable.map(({ x, i }) => (
            <button key={x.id} className={`pill big ${i === editingIndex ? 'accent' : ''}`} onClick={() => place(type, 'replace', i)}>
              Replace {x.name}
            </button>
          ))}
          <button className={`pill big ${editing ? '' : 'accent'}`} onClick={() => place(type, 'add')}>
            Add as {nextSectionName(song, type)}
          </button>
        </div>
      )}
    </Sheet>
  );
}
