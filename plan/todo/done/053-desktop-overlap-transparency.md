# Exomux-style overlapping window glass

Status: complete — 2026-10-05. Additive owner follow-up to task 052; private builds only.

The desktop previously blended all windows with wallpaper, ignoring lower windows. It now matches Exomux's recursive
styled-cell color impressions without leaking lower glyphs into text selection or blending the window with itself.

- [x] Share Exomux's glyph-coverage impression convention; preserve its existing behavior.
- [x] Capture the true scene before chrome/client paint, blend body/chrome at their respective opacities and retain
      proper stacking, opaque behavior, clipping and incoming-animation suppression.
- [x] Golden-color/portable integration and actual default/consumer overlapping-window browser regressions.
- [x] Re-vendor private previews and rerun affected broad/packaging/history/scroll/resize gates on final source.

No publication, live-daemon testing or owner plan edits. Full-Mermaid task 050 remains separate.

All 42 focused animation/engine/portable-UX/glass tests pass. Default, HTTP and pinned HTTPS browser oracles each check
32 independently captured overlapping-glass colors plus transitions, off persistence and reduced motion. Both private
builds are re-vendored; source/export verification passes all 15 tests. History/scroll/resize/clipboard/TLS/prefix
reruns pass. Final suites pass 3,940 root/42 steps, 558 Exomux, 63 web and 54 workers. A stale stable-symbol baseline is
the only combined-health failure (52/53); regenerate the missing helper addition, retaining owner exports, then all 49
non-suite gates and 25 API/budget tests pass. Production source and preview bundles do not change for that baseline fix;
all 16 final hashes match. Receipts: projects/.scratch/window-animations/combined-health.log,
combined-packaging-rerun.log, api-baseline-tests.log and combined-final.sha256.

### Owner preview check

Fresh revalidation passes 19 portable glass/animation/UX tests, seven Exomux transparency tests and both actual default
and private HTTPS browser oracles, each with 32 independently computed overlap colors. Both private servers return the
current consumer bundle bytes. No runtime change or rebuild is needed for this recheck. Hard-refresh the private preview
and check Settings → Windows: persisted solid windows disable glass; the default is 90% opacity, while the 65% option
makes the lower-window color impressions clearer. These checks use isolated browser storage and do not change the
owner's preferences. Public Pages remains unpushed; visual approval is still separate.
