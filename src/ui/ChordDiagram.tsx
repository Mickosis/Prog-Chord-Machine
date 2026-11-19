import { mod12 } from '../theory/notes';
import type { Tuning } from '../tuning/tuning';
import type { Frets } from '../voicing/solver';

interface Props {
  frets: Frets;
  tuning: Tuning;
  bassPc: number;
  rootPc: number;
  size?: number;
}

const ROWS = 5;

/** Vertical chord box: low string on the left, nut/base fret on top. */
export function ChordDiagram({ frets, tuning, bassPc, rootPc, size = 1 }: Props) {
  const n = frets.length;
  const gap = 18 * size;
  const rowH = 22 * size;
  const padX = 22 * size;
  const top = 26 * size;
  const width = padX * 2 + gap * (n - 1);
  const height = top + rowH * ROWS + 22 * size;

  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = maxF <= ROWS ? 1 : minF;
  const x = (i: number) => padX + i * gap;
  const y = (row: number) => top + row * rowH;

  return (
    <svg
      className="diagram"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Frets ${frets.map((f) => (f === null ? 'x' : f)).join(' ')}`}
    >
      {/* fret lines */}
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <line
          key={r}
          x1={x(0)}
          x2={x(n - 1)}
          y1={y(r)}
          y2={y(r)}
          className={r === 0 && base === 1 ? 'nut' : 'fret'}
        />
      ))}
      {/* strings */}
      {frets.map((_, i) => (
        <line key={i} x1={x(i)} x2={x(i)} y1={y(0)} y2={y(ROWS)} className="string" strokeWidth={1 + (n - i) * 0.18} />
      ))}
      {base > 1 && (
        <text x={x(0) - 8 * size} y={y(0) + rowH * 0.65} className="basefret" textAnchor="end">
          {base}
        </text>
      )}
      {frets.map((f, i) => {
        const cx = x(i);
        if (f === null)
          return (
            <text key={i} x={cx} y={top - 9 * size} className="mute" textAnchor="middle">
              ×
            </text>
          );
        const pc = mod12(tuning.strings[i] + f);
        const cls = pc === bassPc ? 'dot bass' : pc === rootPc ? 'dot root' : 'dot';
        if (f === 0)
          return <circle key={i} cx={cx} cy={top - 13 * size} r={5 * size} className={`open ${pc === bassPc ? 'bass' : ''}`} />;
        const row = f - base + 0.5;
        return <circle key={i} cx={cx} cy={y(row)} r={7 * size} className={cls} />;
      })}
      {/* string-number hint for the lowest string */}
      <text x={x(0)} y={height - 6 * size} className="strnum" textAnchor="middle">
        {n}
      </text>
      <text x={x(n - 1)} y={height - 6 * size} className="strnum" textAnchor="middle">
        1
      </text>
    </svg>
  );
}
