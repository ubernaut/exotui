# exomonitor

A themeable, responsive system monitor, and the worked example for `@ubernaut/exotui/viz`.

It exists as a proving ground: real data of several shapes, arriving at different rates, on a terminal whose size nobody
controls. Nearly every feature of the visualisation layer was written because this needed it.

```sh
deno task exomonitor                    # run it
deno task exomonitor:preview 120x36     # print a screen at any size, without resizing a terminal
deno task exomonitor:preview 18x4       # including sizes nobody can resize to
```

Needs `-A`: Deno refuses `/proc` reads to anything less, and `--allow-read=/proc` is refused too. Started narrower it
shows whatever is left and says so in the status bar rather than concluding the machine has no CPU.

Keys: `m` settings · `t` theme · `q` quit. In settings: `↑↓` move, `←→` change page, `space` acts, `esc` closes.

## How it decides what to draw

**Sources and feeds.** A source is a thing you monitor — CPU, memory, the network. A feed is one way of reading it, and
they are different questions: overall CPU load is a number over time (`0dt`), per-core load is an array over time
(`1dt`). Feeds are named separately because dimensionality decides what can draw them.

**Tiles.** The selected feeds divide the terminal into equal tiles. The grid shape is chosen to keep tiles wider than
tall, because character cells are tall and charts plot time sideways. A final row holding fewer tiles spreads them
across the width rather than leaving a hole.

**Fitness.** Each tile asks the registry what suits _its data_ at _its size_. That is not a fixed table: eighty-eight
cores drawn as bars want eighty-eight columns and four cores want four, so the same feed at the same size picks
differently on different machines. Where nothing can be drawn honestly the tile keeps its number and drops the chart —
which is how an 18x4 terminal ends up reading `cpu 42%  mem 70%  gpu 10%  net 20K/s`, with no special case for it.

**Live feeds.** Reading `/proc` sixty times a second is waste; drawing an audio spectrum once a second is lag. A feed
can declare itself live, and its tile is then redrawn by its own data — audio analyses at 60 Hz with overlapping windows
and pushes each frame as it lands — on a second view above the screen, so the fast path costs one chart rather than the
whole terminal.

**Transparency.** Ground cells carry no background, so a host compositing behind this window — exomux's per-window
opacity, a terminal's own transparency — has something to blend. A cell with an explicit background is opaque by
definition. `--opaque` paints the theme's ground back on.

**Overrides.** Where several visualisations fit, the Display page in the settings modal lists them with the registry's
own reason ("fits comfortably", "88 entries are tight here") and lets you pin one. A pin that stops fitting is ignored
rather than obeyed.

## Layout

| File          | What it holds                                                         |
| ------------- | --------------------------------------------------------------------- |
| `feeds.ts`    | the catalogue: what each source can show, and at what dimensionality  |
| `tiles.ts`    | the adapter — live entry counts handed to the library's `planTiles`   |
| `compose.ts`  | the whole screen as one frame of coloured cells                       |
| `settings.ts` | the settings model: pages, toggling, pinning                          |
| `view.ts`     | mounting: one VisualizationView, and a modal of exotui controls       |
| `sources/`    | the parsers — `/proc`, sysfs, `nvidia-smi`, and 60 Hz audio capture   |
| `preview.ts`  | prints a composed screen at any size, for judging a layout by looking |

Everything above `view.ts` is pure and tested without a terminal — the suite lives in `tests/exomonitor_*.test.ts` and
runs with the rest of the library's.
