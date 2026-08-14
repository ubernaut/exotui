# Exomux Butterchurn — Right-Click Menu + Preset Favorites

Status: specified Aug 14 2026 (user); not started. Implement **after** the butterchurn GPU-preset fidelity work (the
GPU-vs-CPU render gap). Applies to **both** butterchurn backgrounds — the GPU `"butterchurn"` and the software
`"butterchurn cpu"`.

## Requirements (from user direction, Aug 14 2026)

1. **Context-dependent right-click menu** over a butterchurn background, with two items:
   - **"bg settings"** — opens the background settings/config modal for the _current_ background (same modal reached
     from the settings UI; scoped to whichever butterchurn is active).
   - **"favorite &lt;checkbox&gt;"** — toggles whether the _current preset_ is in the favorites list. The checkbox is
     **checked when the current preset is already a favorite**.
   - Both are **context-dependent**: they act on the currently-active background and its currently-showing preset, and
     should only appear (or be enabled) when a butterchurn background is active.
2. **Per-preset favorites list**, persisted. Favoriting adds the current preset (by name — stable across the
   catalog/rotation changes) to the list; unfavoriting removes it. Consider whether the GPU and software backgrounds
   share one favorites list or keep separate lists (they can favorite different presets that render on each renderer — a
   shared list is simpler; a per-renderer list is more correct given the render gap — decide during design).
3. **New bg setting toggle for both butterchurns: "Favorites only"** — when on, the field auto-cycles **only the
   favorites list** instead of its full/curated catalog. When the favorites list is empty (or has one entry), fall back
   sensibly (cycle the normal curated catalog, or hold the single favorite) rather than showing nothing.

## Notes / anchors (for the implementer)

- Right-click already opens the **start menu** under the cursor over a bare butterchurn desktop (`routeWindowPointer`,
  `event.button === 2` in `packages/exomux/app.ts`). This new menu is a _different_, background-specific context menu —
  decide whether to extend the start menu with these context items when a butterchurn is active, or add a dedicated
  context menu. The `ContextMenu` upgrades in 028 WS-007 are relevant.
- The current preset name is `backgroundField.presetName` (`ExomuxButterchurnField.get presetName`); the field exposes
  `selectPreset(index)` / `presetIndex`. The favorites-only cycle needs the field to cycle a **name-filtered** subset —
  either pass a filtered `catalog` (like the GPU/software rotations) or add a `presetFilter`/`favorites` option to
  `ExomuxButterchurnField` that constrains `nextPreset()` while keeping every preset reachable by index.
- The **"bg settings" toggle** joins the existing `BUTTERCHURN_SETTING_SPECS` (shared by both butterchurn ids) in
  `model.ts` as a boolean ("Favorites only", `onOff`), persisted like the other background settings. The favorites
  _list_ itself is workspace/persisted state on the controller, not a background setting spec (it's a list, not a knob).
- Persistence: favorites and the toggle persist through `#persistMetadata` / `onPreferencesChanged` (controller), the
  same path `backgroundSettings` uses.

## Definition of done

- Right-clicking a butterchurn background offers "bg settings" (opens the config modal for the active background) and
  "favorite" (checkbox reflecting/ toggling the current preset's membership).
- A "Favorites only" toggle on both butterchurn backgrounds restricts auto-cycle to the favorites list, with a sane
  empty/one-entry fallback.
- Favorites + the toggle persist across restart. Tests cover: favorite toggle round-trips through persistence; the
  favorites-only cycle only visits favorited presets; the menu items reflect the current preset/background.
