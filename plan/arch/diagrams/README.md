# Architecture diagrams

Use this directory for diagrams that are too large, reusable, or unsuitable for embedding in an architecture document.
Prefer inline Mermaid for simple diagrams.

Keep editable source files as the source of truth, and link each diagram from the architecture document it supports. Add
diagrams only when they communicate the design more clearly than concise prose.

## In this directory

Each file is a Markdown document holding one Mermaid source plus a short note on what to notice. Markdown rather than a
bare `.mmd` so the source stays editable _and_ renders where it is read.

| Diagram               | Supports                                       | Shows                                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `render-pipeline.md`  | `../overview.md` — renderer neutrality         | How one component tree reaches three different outputs        |
| `pointer-pipeline.md` | `../overview.md` — one pointer authority       | A press from terminal bytes to a handler, and where it stops  |
| `exomux-protocol.md`  | `../overview.md` — the daemon outlives clients | Attach, replay, relay, and the capability gate                |
| `theme-resolution.md` | `../overview.md` — themes resolve              | A colour from document to painted cell, through its fallbacks |
