# Markdown and Mermaid document renderers

Status: In progress — 2026-10-04.

## Outcome

Reusable ExotUI document authoring: terminal-native Markdown, ASCII heading fonts, and Mermaid flowchart parsing/layout
with cell and SVG outputs. The tech-stack site becomes the worked consumer, built entirely from Markdown and Mermaid.

The consumer must start from the complete ExotUI GitHub Pages desktop, with the same window system, shaders,
themes/editor, and backgrounds. The user rejected a paper site with two decorative canvases. The latest requirement is
to use relevant ExotUI components and make Markdown look like a terminal application; browser HTML overlays are not its
primary renderer.

## Current state

October 4 chart-review pass: the tech-stack user asks for better charts. The shared bounded circuit renderer now
preserves optional-only chains, supports compact horizontal chains with separate independent-service rows, aligns
support packages with their actual consumers, centers single-rank core pins and prevents captions from erasing other
connections. Nearby horizontal captions and human-readable fallback legends retain relationship meaning. The consumer
sources are revised and the private preview rebuilt; 31 focused document/circuit/scroll tests and site source/artifact,
window/mobile, Pages-subpath and all 229 source/presented-cell scroll checks pass. Broad chart-source health passes all
53 gates (3,912 root/41 steps, 558 exomux, 63 web, 54 worker). The user then reports widening the browser leaves new
columns blank: reproduce 1,944 missing cells at 800→1280 pixels. Shared web-presenter rows used a nonreactive peek
inside their computed width; use a tracked size read. The rebuilt consumer passes eight shrink/grow frames and 47,134
populated cells; the actual library presenter passes sixteen DPR 1/2 frames with 94,268 exact cells and 94,268 Canvas2D
background pixels. All 51 fresh final-source gates (including web/worker suites) pass after this subsequent fix; these
supplement the earlier broad root/exomux receipt, not an unchanged-source single health run. Human visual review remains
open. No standalone site renderer, push, version bump or publication.

The reusable implementation lives in ExotUI, not in tech-stack. The optional beta `./document` entrypoint exports the
real `Markdown extends Component` widget, parser/controller, component-backed `MarkdownSurface` and
`FlexMarkdownSurface`, shared heading fonts, interactions and accessibility. Markdown paints ExotUI Text children; flex
panels use the existing flexRects engine and mount those same Markdown components. The full experimental `./mermaid`
entrypoint adds the pinned compiler, portable native scenes/cells, cache and reactive
`MermaidMarkdownController`/`MermaidFlexMarkdownSurface`. These plug Mermaid into the real Markdown component rather
than creating a separate website renderer. There is no standalone public Mermaid widget class; the reusable native
component integration is the document renderer/controller API. The optional `./mermaid/headless` host adds isolated
compilation without pulling browser/upstream dependencies into the core entrypoint.

The October 4 semantic/text continuation is recorded in task 050, priority, architecture, test strategy and progress
logs. Final focused/lint/type/font/scroll checks pass; the final full browser/headless catalogues finish zero, while
health passes all 53 gates and full-standard acceptance remains open. The tech-stack preview uses the refreshed
component-backed bounded renderer; it has not been switched to the unfinished full-standard renderer.

The user now requests the full Mermaid diagram standard. Task [050](050-full-mermaid-standard.md) owns that expanded
scope; the flowchart-only implementation and earlier green gates do not establish its completion. Existing document,
title and scrolling behaviour must be retained as full-standard integration proceeds.

The latest title revision restores the earlier FIGlet Standard font, not a newly added Graffiti font. Optional
`TITLE_HEADING_FONTS`/`headingArt: "title"` permit art only for an opening unquoted H1; the flex document applies that
policy once across the entire window, not once per panel. The consumer hides duplicate opening chapter chrome and uses a
full-width opening row so the title is the first document content. Body/cards retain their 120-cell PDF layout. The
complete cover banner needs 123 cells and becomes plain text below that width, never clipped or wrapped art. Eighteen
focused tests and 229 browser source/presented-cell checks pass, including exact fit boundaries and all product windows.
Source/artifact and Pages-subpath checks pass. Broad suites pass (3,718 root with 41 steps / 558 exomux / 63 web / 54
worker) and all 48 fresh non-suite health gates pass. The initial run's only failure was stale API-reference output
checked before regeneration finished; the final generated artifact passes. This is combined verification, not a green
initial run. Logs: /tmp/exotui-title-health.log and /tmp/exotui-title-gates-final.log. No push or publication.

The user then reported scrolling glitches. Reproduced blank content in 38/43 native browser scrolling samples and in a
minimal mounted Markdown viewport. Fixed Canvas dirty-region selection: an updated object marked moved with an unchanged
rectangle must still paint, especially after resize discards the frame while clipped rows disappear. Added core canvas,
mounted Markdown and flex document cell-by-cell regressions. The corrected private consumer build passes the original 43
samples and an expanded 181-sample check of document snapshots and actual browser-presented cells, across normal/rapid
input, every chapter, responsive reflow and all 15 product routes. `env -u NO_COLOR deno task health` passes all 52
gates (3,716 root with 41 steps / 558 exomux / 63 web / 54 worker tests; 87 benchmark cases). Log:
/tmp/exotui-scroll-health.log. The prior presence/offset browser checks did not establish scrolling correctness.

New visual revision implemented: the user found heading fonts oversized/unspaced and Mermaid charts unattractive, and
requested the PDF's layout through ExotUI's flexbox engine. Added a reusable flex document controller/surface using
`flexRects`, compact headings with explicit word spacing, and opt-in circuit-package/semantic trace presentation. The
consumer keeps the complete desktop. Seven new pure/mounted tests and the consumer's source/browser/subpath probes pass.
The broad suites passed 3,713 root (41 steps), 558 exomux, 62 web and 54 worker tests. The first health run failed only
the release check's missing explicit public type annotation; corrected it, reran focused tests, and all 48 non-suite
health gates pass on the final source. Logs: /tmp/exotui-flex-document-health.log and
/tmp/exotui-flex-document-gates-final.log. Earlier green health results below apply to the prior revision. Obtain visual
review for this revision before release.

Implemented the optional beta `./document` surface, promoted GlyphForge fonts, shared circuit router, bounded flowchart
parser/layout/cell/SVG outputs, opt-in Markdown heading/diagram integration, clickable links, and component-backed
MarkdownSurface. The original desktop has application registration/initial-window/branding seams and regression tests.
The tech-stack consumer is now Markdown-authored, terminal-native, built and browser-verified over Tailscale.

Focused renderer/Markdown/desktop/API checks, package checks, and release dry run pass. The full exomux suite passed
(558 tests). A root run passed 3,700 tests but five color assertions failed under the session's NO_COLOR=1; the same
five fail on untouched 3bb38c64 and all pass with NO_COLOR unset. The final `env -u NO_COLOR deno task health` run
passed all 52 gates: 3,706 root tests (41 steps), 558 exomux tests, 62 web tests, and 54 worker tests. The added
interactive document viewer separately passes `document:check`. Human real-terminal review remains open. No push, merge,
version bump, or publication.

## Acceptance checks

- [ ] PDF-style responsive flex panels, paired project cards, chapter chrome and continuous scrolling are visually
      reviewed in the consumer.
- [x] Compact fonts retain readable word/letter spacing; circuit-style diagrams retain labels, meanings and bounds.
- [x] Restore the earlier legible font for at most one opening banner per document window; later headings remain plain
      and no art appears if the complete title cannot fit. Keep the banner first without widening the PDF-style body.
- [x] Actual content cells survive repeated panel clipping, scrolling and responsive reflow; regressions compare mounted
      snapshots with authoritative Markdown rows instead of checking only viewport offsets.

- [x] Extend the existing Markdown parser/controller without changing default output or introducing a new core
      dependency.
- [x] Offer distinct, width-aware ASCII heading fonts with readable fallback.
- [x] Extract orthogonal routing and trace glyphs from the circuits background into shared code; circuit regression
      tests still pass.
- [x] Render supported Mermaid flowcharts deterministically in all directions, with node avoidance, labels, branches,
      cycles, and bounded resource usage.
- [x] Reject unsupported Mermaid syntax explicitly; escape untrusted output.
- [x] Expose document functions through an optional public entrypoint, document their supported grammar, and test
      browser compatibility.
- [x] Build tech-stack's 16 chapters and 15 product briefs from Markdown sources.
- [x] Use existing Markdown/component/controller/theme/viewport facilities for terminal-native documents instead of a
      parallel browser viewer.
- [x] Verify desktop extension seams preserve the original window, shader, theme, and background behavior; the consumer
      retains the full application.
- [x] Run focused tests, package/API gates, and the full health gate. Preserve any pre-existing failures as evidence,
      not as silent baseline changes.
- [ ] Visible component changes receive the maintainer review required by the repository workflow.
- [ ] Once components are complete, prepare the appropriate version/changelog, retain exomux dependency compatibility,
      and pass package/release checks.
- [ ] Publish the authorized ExotUI version through the established workflow and verify the intended package/version is
      available.

## Notes

Do not modify user-owned `plan/plan.md`. On 2026-10-02 the user explicitly authorized publishing a new ExotUI version
once these components are done. Normal library release integration/push/publish steps are authorized after completion
and verification; repository gates and visible-component review still apply. This does not authorize releasing
unfinished source or publishing the tech-stack site, which still awaits corrected-preview approval.

The user subsequently reversed the shutdown request and explicitly requested restoring the site. The unchanged private
preview is active at http://100.121.14.68:4173/ on old-donkey; do not describe it as still down or as the new full
renderer. Keep it unchanged during current full-standard verification. Full Mermaid scope belongs to task 050; the
earlier bounded flowcharts are not completion evidence. Reference: https://mermaid.js.org/syntax/flowchart.html.
