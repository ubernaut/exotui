# Exomux animations in the portable desktop and tech-stack

Status: complete — 2026-10-05. Private builds only; owner visual review remains.

Reuse Exomux's existing cell-native surface effects in the default desktop, then re-vendor the consumer. Window state
and input stay immediate; animation snapshots never own focus, geometry, history or application content. Do not publish,
touch the live Exomux daemon, or change the separately unfinished full-Mermaid task.

- [x] Open/close, minimize/restore, maximize/unmaximize and raise/lower visuals use the existing surface engine.
- [x] Detached styled snapshots, exact taskbar flight anchors, clipping, rapid replacement and resize cancellation.
- [x] Configurable/persisted speed and effects; off and host reduced motion leave no ghosts or hidden windows.
- [x] Deterministic controller tests and actual default/consumer browser transition checks; retain history/scroll/copy.
- [x] Default Pages and consumer builds, broader checks, plan reconciliation and live private HTTP/HTTPS receipt.

Existing dirty work belongs to the owner. Keep both `plan/plan.md` files untouched. GPU/theme aesthetics need owner
review.

Final combined verification includes sibling task 053: all 42 focused tests and default/HTTP/HTTPS browser checks pass,
including real Settings/off persistence, reduced motion and 32 independent overlap colors per host. All 15 consumer
source/export tests, routes/history, 243 scroll samples, eight resize frames/47,134 cells, clipboard, prefix and pinned
HTTPS checks pass. Full suites pass 3,940 root/42 steps, 558 Exomux, 63 web and 54 workers. Initial combined health is
52/53 only because the generated stable-symbol baseline omitted the new helper; regenerate that one addition, then all
49 non-suite gates and 25 API/budget tests pass without production changes. Final 16 source/config/API/bundle hashes
match. Receipts: projects/.scratch/window-animations/.

An earlier bundle ceiling failure was resolved by using the renderer's existing characterWidth helper instead of an
alternate Unicode profile. Combined default artifact is 892,885 bytes, below the unchanged 900,000 limit. Both services
retain original PIDs and serve exact rebuilt bytes. PDF/Markdown and owner-plan hashes remain unchanged; nothing is
pushed or published. Full-Mermaid task 050 remains unfinished separately.
