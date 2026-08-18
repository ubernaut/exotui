# Render pipeline

Supports `../overview.md` — "renderer neutrality".

One component tree, three outputs. Components describe cells; nothing above the sink knows what a terminal is.

```mermaid
flowchart TD
  App["TerminalApp / component tree"]
  Draw["Component.draw()<br/>writes cells, never escape codes"]
  Canvas["Canvas<br/>cell buffer + dirty ranges"]
  Queue["Range-aware render queue<br/>repaints what changed, not the screen"]

  Ansi["AnsiCanvasSink<br/>src/canvas/sink.ts"]
  Browser["BrowserCellCanvasSink<br/>src/web/cell_canvas_sink.ts"]
  Memory["MemoryCanvasSink<br/>src/canvas/sink.ts"]

  Term["Terminal<br/>capability-detected: truecolor, mouse modes, kitty graphics"]
  Web["Browser canvas"]
  Test["Test assertions<br/>frameBuffer read cell by cell"]

  App --> Draw --> Canvas --> Queue
  Queue --> Ansi --> Term
  Queue --> Browser --> Web
  Queue --> Memory --> Test
```

## What to notice

- **The fork is at the sink, not in the components.** A widget that emits `\x1b[` directly has broken the property that
  makes the browser build and the headless tests possible.
- **The test path is a first-class sink**, not a mock. What a test reads is what a terminal would have been sent, which
  is why a mounted test can catch a paint that never happened.
- **Capability detection lives below the sink.** Truecolor, mouse tracking modes and kitty graphics are negotiated with
  the terminal; components ask for a colour and get the best available representation.
