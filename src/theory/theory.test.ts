import { describe, expect, it } from 'vitest';
import { ch, C_MINOR } from '../test/fixtures';
import { chordSymbol, diatonicQualities, diatonicTriad, extensionOptions, QUALITIES, QUALITY_IDS, romanNumeral, simplifyQuality } from './chords';
import { keyPrefersFlats } from './scales';

describe('theory', () => {
  it('only knows dyads and triads, built diatonically', () => {
    for (const id of QUALITY_IDS) expect(QUALITIES[id].intervals.length).toBeLessThanOrEqual(3);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => diatonicTriad(C_MINOR, d))).toEqual([
      'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj',
    ]);
    expect(diatonicQualities(C_MINOR, 0)).toEqual(expect.arrayContaining(['5', 'm3', 'min', 'sus2', 'sus4']));
    expect(diatonicQualities(C_MINOR, 1)).not.toContain('5'); // D–Ab is a tritone
  });

  it('names chords and numerals plainly, with flats in flat keys', () => {
    expect(chordSymbol(ch(0, '5'), true)).toBe('C5');
    expect(chordSymbol(ch(5, 'm3'), true)).toBe('Fm(no5)');
    expect(chordSymbol(ch(10, '5', { bass: 0 }), true)).toBe('Bb5/C');
    expect(romanNumeral(ch(8, 'maj'), C_MINOR)).toBe('♭VI');
    expect(romanNumeral(ch(7, '5'), C_MINOR)).toBe('V5');
    expect(romanNumeral(ch(2, '5', { bass: 0 }), C_MINOR)).toBe('II5/I');
    expect(keyPrefersFlats(C_MINOR)).toBe(true);
    expect(keyPrefersFlats({ tonic: 9, mode: 'aeolian' })).toBe(false);
  });

  it('maps qualities from older saves to dyads/triads', () => {
    const cases: [string, string][] = [['maj9', 'maj'], ['m11', 'min'], ['maj7#11', 'maj'], ['m7b5', 'dim'], ['7sus4', 'sus4'], ['sus2', 'sus2']];
    for (const [old, now] of cases) expect(simplifyQuality(old)).toBe(now);
  });

  it('names extended chords and offers in-key extensions', () => {
    const name = (root: number, q: Parameters<typeof ch>[1], adds: number[]) => chordSymbol(ch(root, q, { adds }), true);
    expect(name(5, 'min', [10])).toBe('Fm7');
    expect(name(5, 'min', [2, 10])).toBe('Fm9');
    expect(name(8, 'maj', [11])).toBe('Abmaj7');
    expect(name(0, 'min', [2])).toBe('Cm(add9)');
    expect(name(0, 'maj', [9])).toBe('C6');
    expect(name(0, '5', [2])).toBe('C5(add9)');
    expect(name(0, 'sus4', [10])).toBe('C7sus4');
    expect(name(2, 'dim', [10])).toBe('Dm7♭5');
    expect(romanNumeral(ch(5, 'min', { adds: [10] }), C_MINOR)).toBe('iv7');
    // In C minor the 9th on D is ♭9 (Eb), the 7th on Ab is major (G).
    expect(extensionOptions(ch(2, 'dim'), C_MINOR).find((e) => e.label === '9th')?.interval).toBe(1);
    expect(extensionOptions(ch(8, 'maj'), C_MINOR).find((e) => e.label === '7th')?.interval).toBe(11);
    // A sus2 already has its 9th.
    expect(extensionOptions(ch(0, 'sus2'), C_MINOR).map((e) => e.label)).not.toContain('9th');
  });
});
