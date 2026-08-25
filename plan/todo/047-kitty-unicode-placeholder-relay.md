# Kitty Unicode placeholders: relay the image id, not just the image

Status: **open, August 24 2026.** The corruption this was found through is fixed; the image still does not appear.

## Outcome

An application drawing images through an exomux terminal with kitty's **Unicode placeholder** protocol — which is what
anything running under tmux must use, and what `terminal-browser` does — has its images actually rendered by the host
terminal, instead of a rectangle of blank placeholder cells.

## What was found, August 24 2026

Reported as "funky screen corruption when codex opens a kitty-based split terminal containing a browser", and over a
remote session "it basically corrupts the entire exomux display". Reproduced live. The chain, confirmed from the process
tree and `tmux capture-pane`:

```
Ghostty → exomux client (pts/10) → exomux daemon PTY (pts/22) → bash → `tmux a`
        → tmux session 0, pane 0:0.1 → terminal-browser (electron)
```

`tmux capture-pane -p -e -t 0:0.1` returns rows of `U+10EEEE` — the kitty Unicode placeholder — each carrying two
combining diacritics (row index, column index), the whole run prefixed with `ESC[38;2;28;239;13m`. That truecolor
foreground is not decoration: **kitty encodes the image id in the cell's foreground colour**, with the id's most
significant byte in an optional third diacritic. `allow-passthrough` is `on` for both panes, so the image data does
reach exomux.

Two defects, one fixed here and one still open.

### Fixed — a combining mark was taking a column of its own

`UNICODE_CHAR_REGEXP` (`src/utils/strings.ts:10`) pairs an **astral** base character with at most **one** combining
mark; the second arrives as a separate character. `terminalGraphicWidth` then floored it at one column
(`Math.max(1, …)`), so every placeholder cell consumed two columns instead of one. Measured, not inferred:

```
base+2  split: ["􎻮̅","̍"]      3 placeholder cells -> 6 chars, want 3
```

An image was therefore painted twice as wide as the pane holding it, overflowed, wrapped, and cascaded down the screen.
Worse, a cell holding a _bare_ combining mark gets painted into the host's output stream, where the host terminal
combines it with whatever the compositor drew immediately before — which is how the damage escaped the window's own
bounds and took the whole desktop with it, exactly as reported over the remote session.

Fixed in `src/runtime/terminal_screen.ts`: a glyph measuring zero columns is attached to the glyph it modifies and never
given a cell. Five tests in `tests/terminal_screen.test.ts`; four of them fail without the change. This is a general
correctness fix — any text with two or more combining marks was mislaid the same way — not a kitty-specific one.

### Open — the relay remaps the image id, and the placeholder cells do not follow

`KittyPassthroughRelay` (`src/runtime/kitty_passthrough.ts`) gives every session a disjoint host-id block and rewrites
`i=` on the way through, so two children both using `i=1` cannot collide at the host. Correct for cursor-anchored
placements. Wrong for virtual ones, because:

- **`U` is not in the relay's vocabulary.** `placementKeys` is `["p","c","r","x","y","w","h","z","C"]` — no `U`. A `U=1`
  virtual placement is rewritten into a real, cursor-anchored one.
- **The id is also in the cell foreground**, and the relay cannot reach cells. It transmits the image to the host under
  host id `Y` while the placeholder cells still name child id `X`. The host finds no image `X` and draws nothing.

So after the width fix the pane is a clean grid of blank placeholders instead of a smear — a much better failure, and
still a failure.

## Approaches

1. **Pass `i` through unchanged when `U=1`.** One line, and it would work today. The cost is that the collision the id
   block exists to prevent comes back for placeholder images specifically; two sessions each running a browser could
   show each other's frames. Cheap, and honest only if the collision is documented.
2. **Rewrite the placeholder cells' foreground at paint time.** Correct. The painter detects `U+10EEEE` cells and
   substitutes the relay's host id for the child's. Costs a lookup in the paint path and plumbing from the relay to the
   painter.
3. **Namespace by the high byte.** Remap `i` to `(sessionByte << 24) | childId`, leaving the low 24 bits — and so the
   foreground — untouched, and add or replace only the third diacritic on placeholder cells. Keeps ids disjoint and
   touches colour not at all, but still needs the painter to rewrite cells.

Recommendation: **3**, with **1** as an interim behind a setting if an image on screen this week is worth the collision
risk. Either way the relay must learn `U`, and `a=d` deletes must scope to virtual placements too.

## Acceptance checks

- [x] A kitty Unicode placeholder row occupies one column per placeholder; no cell holds a bare combining mark.
- [x] The "exomux cannot show them yet" warning no longer fires when passthrough is on and a relay exists.
- [ ] `U=1` survives the relay as a virtual placement, and the host renders the image at the placeholder cells.
- [ ] Two sessions drawing placeholder images at the same child id do not show each other's images.
- [ ] Deleting a virtual placement removes it; closing the window releases its images.
- [ ] Driven for real in Ghostty: `terminal-browser open --split right` inside `tmux a` inside exomux shows the page.

## Notes

- `exomuxChildEnvironment` sets `TERM=xterm-256color` and strips every `KITTY_*`/`GHOSTTY_*` variable, on the reasoning
  that "exomux's emulator does not draw images". With passthrough on that is no longer true, and the environment is now
  the reason a child may not offer images at all. Worth revisiting once virtual placements work — but only then.
- tmux's `allow-passthrough` must be `on` for any of this to reach exomux. It was, here, per pane. Worth stating in the
  docs rather than leaving users to discover it.
