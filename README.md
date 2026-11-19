# Prog Chord Library

A browser app that generates prog-metal chord progressions built from **dyads and triads**, as small 2–3 string shapes for **Drop C (6-string)** and **Drop A (7-string)**, or any custom tuning. It pushes you toward shapes you haven't played yet.

## Features
A phone-style app (a single column, also on desktop) with three screens:

- **Start**: choose 6-string Drop C or 7-string Drop A, set how many chords (3–8), press Generate. Nothing is generated until you do; you can jump back to your last progression or your song from here.
- **Progression**: a strip of chord chips on top (tap to view, drag to reorder) and one big chord card (swipe for the next chord). The card shows the symbol, Roman numeral, notes and diagram, with ⌂ (make this the new key centre), lock, voicing arrows, **Shuffle** (re-pick just this chord at random), **Swap** (choose a chord from a list) and **Extend** (add a 7th, 9th, 11th or 13th on top; an extended chord gets locked so New keeps it). **New** re-rolls the unlocked chords, **Play** loops the progression, **Keep** places it in your song as a verse, chorus and so on. The mode badge on top changes the mode.
- **Song**: the kept sections in order. Play, edit one back in the progression screen, reorder, add variations, export MIDI.
- The ⋯ menu holds Song, Library (saved songs and favourites, JSON backup), Settings (BPM, loop, metronome, novelty, stretch, tunings), undo/redo and "Locked chords move on New".

How progressions are made:
- **Key**: a random mode, weighted toward prog favourites (Phrygian, Aeolian, Lydian, Dorian, Phrygian dominant, Harmonic minor), on any tonic whose scale has a chord on your open low string.
- **Chug chord**: every progression has at least one chord rooted on the open low string's note (C on Drop C, A on Drop A), played with that string open. No other chord is bent toward the low note.
- **Dyads and triads only**: power dyads (C5), third dyads (C(no5), Cm(no5)) and triads (maj, min, sus2, sus4, dim, aug), with plain names. Every shape sounds 2–3 strings; a ringing open string counts as one of them.
- **Guitar-first shapes**: voicings come from the chord, the tuning and your maximum stretch. Open strings ring when they are chord tones, close intervals in the low register are avoided, the bare one-finger drop-tuning barre is never used, and neighbouring shapes stay close on the neck.
- **Novelty**: the app records which shapes it has shown you and favours ones you haven't seen.

## Develop
```sh
npm install
npm run dev     # http://localhost:5173
npm test        # theory, voicing, generator, store (tests sit next to each module)
npm run build
```

## Deploy
Push to `main` on GitHub. In the repository settings, set Pages to deploy from **GitHub Actions**. `.github/workflows/deploy.yml` runs the tests, builds the app and publishes `dist/`.

## Layout
- `src/theory`: notes, modes, chord qualities, Roman numerals
- `src/tuning`: tuning model and presets
- `src/voicing`: voicing solver, finger counting, shape families, ranking
- `src/generator`: seeded progression rules, section contrast and variations
- `src/song`, `src/store.ts`: song model, app state and history
- `src/ui`: React components
