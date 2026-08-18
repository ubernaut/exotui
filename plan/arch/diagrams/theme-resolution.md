# Theme resolution

Supports `../overview.md` — "themes resolve, they do not spread". History: `../../todo/done/042-theme-editor.md`.

How one colour gets from a saved document to a painted cell, and what happens when the document does not mention it.

```mermaid
flowchart TD
  Doc["ThemeDocument<br/>name, plus a sparse token map<br/>chrome:accent = 198 24 118"]
  Chain["resolveControlToken(name, tokens)<br/>walks the fallback chain"]

  Leaf["Control token<br/>window:titlebar-background-active"]
  Tier["Chrome tier<br/>chrome:accent, chrome:on-accent, chrome:line …"]
  Core["Core seven<br/>foreground muted accent success warning danger surface"]

  Spec["ExomuxThemeSpec<br/>ten flat colours + controls map"]
  Paint["exomuxControlColor(theme, token, fallback)"]
  Cell["Painted cell"]

  Editor["Theme editor<br/>picker writes straight through"]
  Contrast["Contrast report<br/>each foreground vs the ground it declares"]

  Doc --> Chain
  Chain --> Leaf
  Leaf -- "not set" --> Tier
  Tier -- "not set" --> Core
  Chain --> Spec --> Paint --> Cell
  Editor --> Doc
  Doc --> Contrast
```

## What to notice

- **Every chain ends at one of the seven.** A theme that defines only those seven paints all forty-one controls, which
  is why adding vocabulary costs existing themes nothing.
- **The chrome tier is the fast path.** Six colours move every control that has not been individually overridden.
- **The editor writes the document, not the screen.** Live preview is the desktop re-resolving, so what you see while
  editing is what a save produces.
- **`exomuxControlColor` always takes a fallback**, so a theme with no document behind it — every preset before it is
  opened — paints exactly as it did before the vocabulary existed.
