# Pointer pipeline

Supports `../overview.md` — "one pointer authority". History: `../../todo/done/040-pointer-input-architecture.md`.

A press, from terminal bytes to the handler that answers it. The point of the rebuild was that every stage below happens
exactly once, in one place.

```mermaid
flowchart TD
  Bytes["Terminal bytes / browser event"]
  Decode["Input reader<br/>SGR mouse decode, any-motion tracking"]
  Warp["cursorQuantized()<br/>pincushion warp, block cursor follows the same cell"]
  Router["MouseInteractionRouter.dispatch()<br/>transform applied at ingress, once"]
  Capture{"drag captured<br/>by an owner?"}
  Owner["Capture owner<br/>keeps the drag until release"]
  Hit["Hit test, highest zIndex first"]

  Modal["modal / start menu — 30000"]
  Top["top bar — 20000"]
  Float["floating windows — 3000"]
  Sep["separators — 2000"]
  Tiled["tiled windows — 1000"]
  Desk["desktop background — 0"]

  Gesture["reducePointerGesture()<br/>pure: click, double-click, drag, recovered"]
  Handler["Handler for the resolved target"]

  Bytes --> Decode --> Warp --> Router --> Capture
  Capture -- yes --> Owner --> Gesture
  Capture -- no --> Hit
  Hit --> Modal --> Gesture
  Hit --> Top
  Hit --> Float
  Hit --> Sep
  Hit --> Tiled
  Hit --> Desk
  Top --> Gesture
  Float --> Gesture
  Sep --> Gesture
  Tiled --> Gesture
  Desk --> Gesture
  Gesture --> Handler
```

## What to notice

- **The warp is applied at ingress and nowhere else.** Downstream code works in one coordinate space. Every bug in the
  old stack came from a second place re-deriving coordinates.
- **The background is layer 0, not layer first.** It used to get first refusal and swallow clicks meant for windows;
  ordering it last by z is what made "click the title bar behind a background chip" work.
- **Gesture recognition is a pure reducer**, so double-click-versus-drag is a unit test rather than a live experiment.
- **A golden hit map** (`packages/exomux/tests/fixtures/hit_map/`) records which target owns every cell, so a change to
  any of this is a reviewable diff.
