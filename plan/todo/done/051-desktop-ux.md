Status: implemented and verified — 2026-10-04; owner hardware/visual review pending.

# Shared desktop UX and font generator

Implement in the default ExotUI desktop, then consume the same implementation in tech-stack. This follow-up does not
complete or change the scope of full-Mermaid task 050, and does not authorize pushing the consumer.

## Acceptance

- [x] Distortion minimum/default rate becomes 0.02 instead of 0.2; maximum magnetization opens a centered alert with a
      large flashing Degauss button. Degaussing resets/dismisses it; boot does not produce a false maximum alarm.
- [x] Background-window client clicks raise/focus it before application actions; selection drags do not activate links.
- [x] Highlighted window text is copyable from the right-click menu, including the private HTTP browser preview.
- [x] Desktop context shortcuts are Settings, Themes, Degauss and Help, not next-background/next-theme.
- [x] Butterchurn uses the noise generator by default; ordinary clicks do not request microphone permission.
- [x] A terminal-native FIGlet generator exposes Small (default), Graffiti and existing fonts, layout and output
      copying. Markdown opening banners default to Small, with one banner per window and width-aware fallback preserved.
- [x] Consumer launcher configuration supports product windows and HTML/PDF/complete-Markdown links; viewport policies
      support exact 1920/1280 CSS-pixel breakpoints without introducing browser dependencies into the portable app.
- [x] Focused regressions, browser checks, build/health gates and consumer propagation are recorded.

The user wrote both “graphiti” and explicit “Small by default”; interpret this as Small by default with Graffiti
selectable. An optional clarification was sent, but work need not block on it. Reuse the existing FIGlet machinery; do
not add a runtime font-generator dependency to the library core.

Verification: 54 focused desktop/document/GlyphForge tests plus five optional Mermaid-flex tests, eleven-file targeted
lint, actual default desktop/browser clipboard and noise checks, full consumer verification (11 tests), desktop
UX/exports, all routes/controls, 243 exact scroll snapshots, eight resize frames/47,134 cells and all three format links
under a simulated Pages prefix. Renewed full health finishes zero: all 53 gates, 3,927 root tests/42 steps, 558 exomux,
63 web and 54 worker tests. Twenty-two frozen production/test/config/budget hashes match. Receipts are in
projects/.scratch/desktop-ux/. The initial health log retains three obsolete Standard-height assertions; the final log
is the passing receipt. Human theme/shader/hardware review and the unrelated full-Mermaid release remain separate.
