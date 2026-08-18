# Kitty Graphics Integration Plan

Kitty graphics support should be implemented as a terminal graphics backend, not as a special case in individual
widgets. The protocol can display raster images in terminals that support it, while the existing ANSI cell renderer and
Three ASCII renderer remain fallbacks.

Primary references:

- Kitty terminal graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- tmux `allow-passthrough` pane option: https://github.com/tmux/tmux/blob/master/tmux.1

## What We Need

### 1. Capability Detection

- Add a `TerminalGraphicsCapability` result to the runtime capability layer.
- Detect likely support from environment signals such as `KITTY_WINDOW_ID`, terminal identity, and explicit user config.
- Add an active query path for terminals that support Kitty graphics queries.
- Treat tmux as conditional support. Newer tmux can pass escape sequences through when `allow-passthrough` is enabled,
  but the library should assume "unknown" unless passthrough is configured or the user explicitly enables Kitty output.
- Provide fallback order:
  1. Kitty graphics.
  2. Sixel or iTerm2 inline images if later added.
  3. ANSI/Unicode block rendering.
  4. Plain text placeholder.

### 2. Protocol Encoder

Create a pure, unit-testable encoder module, likely `src/runtime/kitty_graphics.ts` or `src/renderers/kitty/encoder.ts`,
that can produce escape sequences without touching stdio.

Required encoder pieces:

- Graphics command wrapper using the Kitty application protocol control sequence.
- Key/value control serialization for action, format, transfer medium, ids, placement, dimensions, z-index, quiet mode,
  and deletion.
- Payload base64 encoding.
- Chunking support using continuation metadata for large payloads.
- Transfer mediums:
  - direct payload for small images and remote-safe use,
  - temporary file for large local frames,
  - future shared-memory support only if it can be feature-gated safely.
- Delete commands for image id, placement id, z-index, visible placements, and cleanup on resize/close.
- Response parser for OK/error/query replies.

The encoder should have snapshot-style tests that assert exact control strings for small payloads and chunk boundaries.

### 3. Graphics Surface API

Add a renderer-neutral API that terminal and browser backends can both understand:

```ts
export interface GraphicsSurface {
  readonly kind: "kitty" | "sixel" | "iterm2" | "browser-canvas" | "none";
  putImage(image: GraphicsImage, placement: GraphicsPlacement): Promise<GraphicsHandle>;
  moveImage(handle: GraphicsHandle, placement: GraphicsPlacement): Promise<void>;
  deleteImage(handle: GraphicsHandle, mode?: GraphicsDeleteMode): Promise<void>;
  clear(scope?: GraphicsClearScope): Promise<void>;
  inspect(): GraphicsSurfaceInspection;
}
```

This should sit beside the cell sink/backend catalog. Widgets should ask for a graphics surface and degrade if it is not
available.

### 4. Image Pipeline

We need a small image pipeline that can feed Kitty and browser renderers from the same source:

- Encode RGBA buffers to PNG for portable transmission.
- Optionally send raw 24-bit/32-bit data when a terminal supports it and it is faster.
- Scale to target cell bounds using terminal cell metrics.
- Preserve alpha where useful, but document that terminal compositing differs from browser compositing.
- Cache image ids by widget/window/frame source so unchanged frames do not retransmit.
- Keep an image lifecycle table keyed by window id, widget id, and placement id.

For Three.js scenes, the path should be:

1. Render scene to an offscreen bitmap.
2. Downscale or crop to the pane placement.
3. Send the frame to `GraphicsSurface`.
4. If Kitty is unavailable, use the existing Acerola ASCII cell renderer.

### 5. Placement And Z-Order

Kitty image placement needs to track our window manager:

- Use layout boxes to derive row, column, width, and height in terminal cells.
- Delete or move placements when a pane moves, resizes, scrolls, minimizes, or closes.
- Tie z-index to overlay layers so menus/modals can stay above image surfaces.
- When a modal/menu opens, continue rendering the underlying widget but ensure image placements do not obscure overlay
  text. The simplest first implementation is to delete or lower placements intersecting active overlays, then restore
  them after the overlay closes.
- Scrolling windows need placement movement or clipping; the first version can delete and re-place visible images after
  scroll changes.

### 6. tmux And SSH

tmux is the main operational constraint.

- Document that truecolor and Kitty graphics are separate features.
- For tmux, users need passthrough enabled, for example:

```tmux
set -g allow-passthrough on
```

- The backend should expose a `forcePassthrough` or `mode: "auto" | "direct" | "tmux-passthrough" | "disabled"` option.
- Direct local terminal sessions can use normal Kitty sequences.
- tmux mode wraps graphics sequences in tmux passthrough DCS.
- SSH should prefer direct payload transfer unless a local temp-file path is valid from the terminal emulator's point of
  view. Remote temp-file transfer usually is not valid for the local terminal.

### 7. Tests

Unit tests:

- command serialization,
- base64 payload encoding,
- chunk splitting,
- delete commands,
- tmux passthrough wrapping,
- response parser,
- capability decisions from fixture environments.

Integration tests:

- disabled by default unless `DENO_TUI_KITTY_TEST=1`,
- require a Kitty-compatible terminal or explicit fixture harness,
- draw, move, resize, and delete a tiny image,
- verify the fallback path still renders when Kitty is unavailable.

Manual visual tests:

- workbench pane with a Kitty-rendered Three.js scene,
- image behind modal/menu overlays,
- resizing, maximizing, minimizing, closing,
- tmux passthrough on/off,
- raw SSH vs tmux over SSH.

## Implementation Order

1. Add capability model and pure encoder with tests. Status: implemented in `src/runtime/kitty_graphics.ts`.
2. Add `GraphicsSurface` abstraction and no-op/ANSI fallback implementation. Status: implemented in
   `src/runtime/graphics_surface.ts` with a no-op surface and Kitty command surface.
3. Add Kitty terminal graphics surface with direct payload mode.
4. Add image lifecycle integration to the window manager and scroll/resize events.
5. Add Three.js offscreen frame source and Kitty-backed demo pane.
6. Add tmux passthrough wrapping and documentation.
7. Add optional PNG/raw frame optimization and cache invalidation.

The first useful milestone is not "render every image feature." It is a tested encoder plus one workbench pane that can
draw, move, resize, and delete one image placement without breaking menus, modals, or fallback rendering.
