# Window and menu animations

User direction (Aug 17 2026): add minimize, maximize, restore, close, and open animations for windows, with selectable
animation KINDS and SPEED, and the same treatment for menus (and similar transient surfaces).

Requested close-animation examples: fall apart, explode, disintegrate, incinerate, melt, fade, random. The same
vocabulary should apply to the other transitions where it makes sense; "random" picks per event.

Design notes (to refine when work starts):

- Belongs at the workbench/window-host layer so exomux and the library workbenches share it; menus/toasts/modals reuse
  the same animator on their surfaces.
- Cell-native effects: these animate CHARACTER CELLS (glyphs falling with gravity, dissolving into ░▒ noise, burning
  edge with ember colors, melting columns sliding down, alpha fade via compositing) — not pixel shaders.
- Options: per-transition kind (or "random"), speed (off/fast/normal/slow — duration scale), global reduce-motion
  respect (THEM-008 motion contracts already model essential vs decorative motion).
- Animations must never block input: they play on closed/minimized surface snapshots (capture the window's cells at
  transition start and animate the snapshot) so app state proceeds immediately.
- Settings surface in exomux (per the shader-params pattern); library API as an animator controller usable headless.

- [x] Spec the animator contract (surface snapshot in, timed cell frames out; caller-owned clock) —
      src/surface_animation.ts: SurfaceAnimation.frameAt(elapsedMs) pure per elapsed; sparse cell grid with
      sourceRow/Column for style reuse and heat for embers; direction in/out; seeded determinism.
- [x] Implement the effect library (fall-apart, explode, disintegrate, incinerate, melt, fade; random selector) — all
      six kinds + seeded random resolver + speed scale (off/fast/normal/slow) + transition direction mapping; exported
      from mod.ts.
- [x] Wire window transitions in the shared layer + exomux — src/app/surface_transitions.ts (SurfaceTransitionAnimator:
      settings, MotionContext reduced-motion, replace-per-surface, cancel) exported from mod.app.ts; exomux wraps
      windowHost.execute to snapshot the old cells (styled + plain) and composites ghost overlays above windows with
      source-cell colors and ember heat. Close/minimize/maximize/restore play the old snapshot OUT (new layout paints
      beneath = morph); true open-assembly stays for hosts that can suppress the incoming window. Headless mounts
      (tests/pipes) auto-disable via stdout TTY detection.
- [ ] Wire menu/modal/toast open+close.
- [ ] Exomux settings: kind per transition + speed + reduce-motion.
- [ ] Tests: deterministic frames on a fake clock (DONE: 11 tests — snapshot at 0, empty at end, in-direction assembly,
      per-seed determinism, per-effect invariants); reduced-motion collapse lands with the host wiring.
