# References

Reference material and source documents. Anything here is background for a plan or task, not work in flight.

## In this directory

- `design-notes/tailscale-integration.md` — the original sketch for a network panel with remote shells and drag-and-drop
  scp. **Superseded**: the work shipped as `todo/done/035-exomux-network-menu.md`, and the implementation lives in
  `packages/exomux/tailnet.ts` and the network panel. Kept for the intent behind the feature.

## Elsewhere in the repository

The long-form technical documents live in `docs/` and are the reference material for their subsystems:

| Document                              | Covers                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| `docs/repo-overview.md`               | What lives where                                           |
| `docs/api-reference.md`               | Generated API surface; checked by `deno task health`       |
| `docs/api-stability-and-packaging.md` | The stable surface and how it is versioned                 |
| `docs/terminal-emulation-strategy.md` | How terminal emulation and the multiplexer were approached |
| `docs/exomux-component-audit.md`      | Which exomux surfaces have exotui equivalents              |
| `docs/curses-webtui-parity.md`        | Parity against curses and web TUI toolkits                 |
| `docs/html-css-layout.md`             | The markup and cascade layer                               |
| `docs/testing-and-performance.md`     | Benchmarks and performance methodology                     |
| `docs/taffy-layout-spike.md`          | Layout solver evaluation                                   |
| `docs/visualization-app.md`           | The visualisation showcase                                 |
| `docs/web-framework-plan.md`          | The browser surface                                        |
| `CHANGELOG.md`                        | Released behaviour, user-facing                            |
