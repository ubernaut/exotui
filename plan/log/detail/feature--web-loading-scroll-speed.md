# Detailed development log: `feature/web-loading-scroll-speed`

- **Branch:** `feature/web-loading-scroll-speed`
- **Started:** 2026-11-19, from `main` at `8637fcc3` (0.10.0)

## 2026-11-19 — Scroll speed setting and a loading bar for the web desktop

### Prompt

The maintainer, from the tech-stack consumer session: "exowebtui needs a retro themed progress bar for loading. and you
should also double the scroll speed. and add a settings option to control the scroll speed to make it faster or slower.
twice as fast should be med. current setting should be slow, and 4x faster should be fast."

### Response and strategy

Scroll speed. `handleDesktopWheel` delivered one `onWheel` tick per wheel event; each application decides how many rows
a tick is. The speed is applied in that one handler by repeating the tick (1, 2 or 4 times), so built-in windows and a
host's own applications change pace together and no application interface changes. Not scaled, on purpose: the start
menu's selection, a finger drag (content stays under the finger) and the touch coast. `desktopSettings.scrollSpeed` is
an index into `DESKTOP_SCROLL_SPEEDS`; the saved value is the name, and a missing or unknown name gives the default
(medium). The row is in Settings → Windows, a stepper like "animation speed", with the same click convention.

The 900,000-byte desktop bundle limit decided the shape. `main` had 26 bytes of headroom (899,974). The first version of
the feature measured 900,500; a tighter one 900,376. Rather than raise the limit one day after it was deliberately held,
the settings list was simplified where it repeated itself: `gap`, `heading(title)` and `radio(on, text)` replace
thirteen spacer and heading literals and five radio labels. Result: 899,972, two bytes under the starting point, with
the feature in. A debug-hook entry for the speed was dropped for the same reason; tests read the visible row instead.

Two test traps, both mine: applications register for the life of the process, so each desktop in a test needs its own
application id ("Duplicate desktop application"); and the drawn pointer covers the cell it was clicked on, so a test
that clicked the row's arrow could no longer find the row, scrolled the list to look for it, and then clicked a
different row. The tests click blank cells of the row.

Loading bar. The page was blank until the bundle ran. The bar has to exist before the bundle does, so it is page-shell
HTML with an inline loader, produced by `examples/web/boot_progress.ts` and used by `scripts/build_web_docs.ts`; it adds
nothing to the bundle. The loader fetches the module with XMLHttpRequest for byte progress (the build writes the bundle
size into the page because a compressed response reports no usable total), starts it with a module script, and removes
the bar four frames after a canvas appears. A host with a longer boot passes `ready: "manual"` and calls
`bootProgress().stage()` / `.done()`. The landing page uses canvas readiness precisely so that `desktop_page.ts`, and
therefore the bundle, did not change.

Tradeoff taken: two requests for the module. Measured with a server that sends `cache-control: max-age=600`: one
transfer. A `no-store` server would transfer it twice. Rejected alternative: fetch once and import a blob URL — the
bundle's relative dynamic imports (`./desktop-three.js`) and a consumer's `import.meta.url` paths would break.

First markup depended on `white-space: pre` and a spacer row holding one space. `deno fmt`, which the build runs on the
generated page, emptied the spacer and indented the rows, which `pre` would have shown as blank lines. Spacing moved to
the stylesheet and a test now refuses whitespace between the bar's elements.

### Verification

Focused: `tests/desktop_ux.test.ts` (11), `tests/web_boot_progress.test.ts` (7), the animation, transparency,
presentation and web desktop files (26); `deno fmt --check`; `desktop:check`; `web:demo:check`; `deno lint` on the
changed files. Headless Chromium against the built page with the bundle throttled: 3% at 0.25 s, 37% at 1.35 s, bar
removed, canvas mounted, one bundle transfer, no page errors, at 1280 and 390 pixels.

`deno task health` on `e5e62334` (the three commits above): exit 0, 54 of 54 steps ok. Root tests 4147 passed and 8
ignored, Exomux 574, web 63, workers 54. `docs/assets/desktop.js` 899,972 bytes.

## 2026-11-19 — Follow-ups from the first consumer

### Prompt

None new. The tech-stack site adopted the bar the same day: its own page shell, a fallback link ("Read this document
without the desktop"), `ready: "manual"` and four reported stages. That use showed five things.

### Response and strategy

- Click lost during the fade. The done state had `pointer-events: auto` for the 260 ms before removal (measured in the
  page). It now sets `pointer-events: none`.
- Dead weight in a host bundle. `STYLE` and `LOADER` were built by `.trim().replaceAll()` calls at the top of the
  module, which a bundler must keep. The consumer's vendored desktop bundle grew 4,091 bytes although it used only
  `bootProgress()`. Both are functions now; the same bundle grows 85 bytes for the whole branch.
- Narrow pages. With the 40-character fallback link the panel was wider than a 320-pixel page (-17 to 337 px, clipped
  both sides). `max-width: calc(100vw - 24px)` on the panel and `white-space: normal` on the fallback and on a failure
  message.
- Roles. `role="progressbar"` was on the whole panel with the link inside it. Chromium still exposed that link, so this
  was a wrong structure rather than a measured loss, but a progress bar's children are presentational by definition. The
  role moved to the bar's row; glyphs are `aria-hidden`; the status line is hidden until a failure and then becomes
  `role="alert"` holding only the message. `aria-valuetext` is "40%, 439K of 879K".
- `]100%` had lost its space when the share became a right-aligned cell. The cell is 5ch.

Checked and left alone: whether "four frames after a canvas appears" is too early for the landing page. A screencast
around that moment shows the window and top bar already painted beneath the fading panel, and no blank frame. The
wallpaper module arrives later and blocks the main thread while it starts (about two seconds under software GL in
headless Chromium), exactly as before the bar existed; the bar does not wait for it. In that run the fade itself started
about 220 ms late for the same reason.

Known limit, unchanged: a module that loads but throws while it starts leaves a `manual` page on its last stage, with
the fallback still usable. The loader reports only a module that cannot be fetched. Listening for every window error was
rejected: an unrelated error would paint a working page as failed.

A consumer note that is not about this branch: bundling the Mermaid chunks from a checkout at another path gives the
same 121 files under different hash names (the single-file bundles are byte-identical). A consumer that vendors from a
branch worktree can keep its existing chunks when the branch does not touch Mermaid sources.

### Verification

`tests/web_boot_progress.test.ts` (7), `deno fmt --check`, `deno check` and `deno lint` on the changed files,
`web:pages:build` (bundle unchanged at 899,972). Headless Chromium: panel bounds at 1280, 390 and 320 px in loading and
failed states; accessibility tree; screencast; one bundle transfer with `cache-control: max-age=600`. Consumer: nine
browser suites pass on a build from this revision (packet, guide, history at two widths and under a prefix, scroll with
391 samples and 0 failures, resize, desktop UX, diagrams, prefix, animations).

Not verified here: how the bar and the faster wheel feel in a real browser on real hardware, and on a phone. The
maintainer should look.
