import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Bottom sheet: slides over the screen, closes on backdrop tap, ✕ or Esc. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <span className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="round-btn" onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="close" size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
