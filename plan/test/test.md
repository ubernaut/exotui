# Test strategy

How this project is verified, what each level is for, and how to run it. Current as of October 6 2026.

## Levels

October 6 browser SVG path: `deno task mermaid:test:svg` mounts 57 upstream examples in shadow-isolated stages, checks
strict SVG-only compilation, canceled resize/stale result, theme generations/disposal, script/resource stripping,
stylesheet scope and unchanged browser history. Tech-stack adds actual HTTP/HTTPS four-chart/four-width transparency,
native selection/context Copy probes; keep all 243 source/presented-cell scrolling checks, eight full-desktop resize
frames, history, transitions/glass, exports and Pages-prefix checks. SVG is not canvas-shader-warped and does not feed
the cell glass sampler. Native parity gaps below remain historical/optional, not the new approved browser scope.

Final ink-ownership revision passes complete browser8185/headless41786 and independently audited53health gates55056:
root4131/42steps, Exomux559, web63, workers54/87benchmarks. All1468discovered source inputs match final freeze; seven
existing runtime/test/budget paths changed, no addition/removal. Browser retains all old assertions and adds600 glyph
cases/3600repaints,15planes/390repaints/87172solid pixels and48actual disposed-MathML profiles/288sparse frames. The
original16carrier controls now have0overflow/residue and positive ink. Fonts/counters/66focused/types and39sink/ desktop
tests pass; strict five-module lint passes. The unchanged legacy desktop-test direct-URL import is separately flagged;
do not claim six-file lint success. API/package/release58701pass681files7.79MiB dry-run; protected hashes match,
default899391byte SHA f3b2949624ac05e4a981c997c13696b827ac41610b3800f08e2555d502c8fcf6 is rebuilt. All owned jobs
reaped. Original18pixel controls prove the next radical-rule gap:12wrong thicknesses/all18wrong centers, 0source/paint
changes. Every original task050 requirement stays open; older pending notes below are chronology.

Final auxiliary80700 finishes1 only because strict lint also included the existing web_desktop.test.ts direct-URL
import. The same import is present unchanged in HEAD; no lint rule is disabled or assertion relaxed. Font and counter
hosts,66focused tests and types pass; strict lint of the five changed renderer/fixture/sink-test modules passes. Legacy
desktop-test import modernization remains separate and unclaimed. Thirty-nine sink/desktop-focused tests also pass.
Final complete browser/headless/health checks still run on unchanged1468-input final freeze; initial health's old clip
assertion failure is retained, not claimed green.

Native ink regression: `deno task mermaid:test:browser --ink-overhang-only` passes600glyph/font/style/DPR/odd-cell
cases, 3600sparse/clear/scroll comparisons,15owned geometric/decorated planes,390repaints and87172independent solid
pixels. Raw Canvas proves original overhangs; integer-device references define ownership independently. Twenty narrow
cells legitimately clip the entire carrier, without weakening the original visible-ink controls. `--text-transform-only`
also exercises eight actual upstream MathML diagrams after compiler disposal through48native browser/font/scale
profiles/288sparse frames and264360remote cells. Two-step wheel correction needs frozen-source renewal. Thirty focused
sink tests/types/default build pass; complete final-source broad/font/counter/package verification follows. No full
standard acceptance is inferred. Receipt: mermaid-ink-repaint.woAffJ/.

Final detached-ink revision: complete browser/headless,53audited health gates (root4128/42steps, Exomux559, web63,
workers54/87benchmarks), fonts/counters/types/lint/73focused/format1595/scoped diff/API/package/release681files7.79MiB
dry-run pass on1468unchanged inputs. All owned handles reaped. Independent native-carrier-audit.ts/log proves16cases
paint actual Canvas ink; eight Liberation Mono cases leave2–35pixels after owner-cell clear. Preserve this incremental
paint oracle and fix the sink's advance-only overflow decision next. All original task050 requirements remain open;
earlier pending notes below are history. Receipt: mermaid-glyph-ink.AAgopd/.

Detached ink: `deno task mermaid:test:browser --text-transform-only` retains the old ink/link assertion and adds32
original-pixel/before-after controls,32DOM/96snapshots across sizes/styles/viewBox/zoom/axis-aligned scaling. Eight new
actual styled-font examples yield41combined casing/math diagrams/656disposed Markdown/flex snapshots. Pure tests cover
ink-owned placement, clipped centroids, fully clipped invisibility, style/link/JSON ownership, malformed/overflow/
degenerate boxes, cyclic clips and allocation. Earlier62focused tests pass; renewed guarded-source broad evidence
follows. One measured local antialiased edge pixel is permitted, not layout drift. Exact outlines/shaping, unsupported
font/transform variants and every original task050 gate remain open. Receipt: mermaid-glyph-ink.AAgopd/.

Fraction regression: `deno task mermaid:test:browser --math-fractions-only` passes336original image controls, 676DOM
cases/1344native snapshots/four owned-probe refusals and16actual TeX compiles/256disposed document snapshots.
`--math-fractions-dom-only` isolates the owned-metrics/cleanup tests. Cover default/invalid/negative/zero/relative/
percentage rules, three fonts, both directions, both math styles, viewport zoom, local transforms, padding, uneven
children and in-flow child counts. Known integer units and generated upstream TeX→MathML units are independent oracles.
Pixel coverage, not antialiased bounds, measures fractional bars; before/after screenshots prove unchanged source paint.
ForeignObject clipping is verified rather than widening transforms' clipped samples.

Previous fraction-turn broad regression: the unchanged split-MathML ink/link assertion fails on Liberation Mono case86,
because its previous-cell NBSP+U+0333 carrier is clipped despite20visible original pixels. Separate unclipped originals
have36pixels, and capture changes0pixels. Preserve this assertion and correct clipping. Initial complete health passes
but source changed during it; it is not final-source evidence. Renew all broad/auxiliary/package checks after the
carrier correction on unchanged source. Receipt: projects/.scratch/mermaid-math-rules.mlQmiM/.

Operator regression: `deno task mermaid:test:browser --math-operators-only` checks15original fence pixel controls (three
fonts/five pairs) and six unchanged zero-advance accent controls, plus144DOM cases/300native snapshots and12real Mermaid
compiles/192disposed document snapshots. Original operator boxes, inherited/local directions, logical versus mirrored
ink, styles/links, source/JSON/private-frame ownership and real fallback versus regular MATH-font stretching are
checked. Wrong MATH glyph variants are cropped at the original size, never bitmap-scaled. Accent TextMetrics are
independently compared with original painted pixel bounds within2px; no128px-base inference substitutes for narrow ink.
Automatic density preserves original-box top/body/bottom ink; old matrix assertions remain intact. Complete browser/
headless, all53 independently audited health gates (root4124/42steps, Exomux559, web63, workers54/87benchmarks), types/
lint/fonts/counters/30narrow checks pass on unchanged1467-input freeze; every owned job terminal/reaped. Protected/
default artifacts stay unchanged. Twenty read-only original fraction controls prove eight4px/8px rules captured as1px,
the next fidelity correction. All original acceptance gates remain open; these fixtures do not establish exact outlines/
full feature conformance. Older pending notes are history. Receipt: projects/.scratch/mermaid-operator-fidelity.DIS5BS/.

Final RTL-radical snapshot passes complete browser/headless conformance and all53 independently matched health gates:
root4123/42steps, Exomux559, web63, workers54/87benchmarks. Fonts/counters/four-file types/lint/29narrow tests pass;
1467input names/content match freeze, protected/default artifacts unchanged, all jobs terminal/reaped. Both hosts
preserve57fixtures/all38IDs/all old oracles; headless casing/math grows39diagrams/624snapshots. New root checks below
pass. Original delimiter controls add ten exact correct-ink matches and4,405 wrong-ink pixels, proving next RTL assembly
mirror/actual-height corrections. Full-standard acceptance remains open; older pending receipts are history.

RTL radical regression: `deno task mermaid:test:browser --math-radicals-only` passes four independent original glyph
pixel controls, 48 original-DOM cases and 144 native snapshots. Two fonts and inherited/local LTR/RTL directions cover
square/indexed/fraction/multi-child/nested roots. Six actual trusted Mermaid TeX compiles check source, radical side,
root/fraction bars, color and links; compiler-disposed Markdown/flex/terminal/remote transport adds 96 snapshots.
Failed-before missing notation, quantized fraction overwrite and overescaped test sources remain in the receipt.
Twenty-nine narrow tests and unchanged exports pass; fresh complete verification follows. This is structural notation
and measured host glyph-profile evidence, not full font-outline or standard acceptance. Receipt:
projects/.scratch/mermaid-rtl-radicals.AaPNJ1/.

Final math-order source passes health18114/browser85350/headless53490, all0/reaped. Independent current-log audit proves
53expected/actual/unique gates, no missing/extra/failed/optional: root4123/42steps/5m37s, Exomux559/2m25s, web63,
workers54/87benchmarks. Focused76317 passes701/10steps; fonts7089/counters58555/four-file types41598/lint81260/seven
private peers pass. Both hosts retain57fixtures/all38IDs/all old oracles;33casing/math diagrams survive528disposed
snapshots. Independent1467input membership/content handoff matches final freeze; default/protected artifacts unchanged,
all owned handles terminal/reaped. Final prose/package checks follow without runtime/test changes. Preserve old
failures/ cancelled143receipts. Next original-DOM-proven RTL radical/bar loss and all original requirements; older notes
are history.

Final math-order focused68437 catches a stale optional-module budget (+290B), not a runtime assertion:700pass/onefail.
Regenerate after the final source edits; all five budget tests89148 pass. Old owned corrected browser/headless/health
trees are cancelled/reaped143 after exact-root/tree verification, retaining partial successes without calling them full.
Final1467runtime/config/test/API inputs are re-frozen; browser85350/headless53490/health18114/focused76317/fonts7089/
counters58555 are running and seven pinned peers pass. Audit terminal results, final hashes and all named health gates.
No runtime/test changes after final freeze; every original acceptance requirement stays open.

October 6 ordinary MathML ordering: regression14494 fails first on plain RTL override. Thirty direct cases cover all
five token types/two fonts/90density snapshots, original scalar x positions and authored zero-size mspace baselines.
Native ink, no layout for ordinary monotonic tokens, styles/links, unique later-SVG sequences, JSON/source immutability
and private-frame cleanup are checked. Three diagnostic boundaries retain structural/stretch RTL warnings and pin
current Chromium's forced-horizontal vertical-token profile without a false warning. Fifteen real diagrams join
old18casing/ cluster fixtures for33diagrams/528disposed snapshots. Invalid mixed HTML fixture assumptions are retained
in failed receipts: its original scalar boxes are zero-width, not independently visible Hebrew. A valid styled token
replaces that oracle; old generated-rich-text and mixed-token semantic/space fixtures remain untouched.

Initial complete hosts74312/2556 fail the old mixed-mtext space oracle. Restrict reverse-run detection to overlapping
line boxes, preserving separate legacy rows; three actual micro compiles verify original mixed/cased/space text. Old
health14685 is deliberately cancelled/reaped143 through its exact owned private process tree, not claimed green. Final
targeted97826, four-file types41598/lint81260 and API/entrypoint/reference checks pass; final1467source inputs are
re-frozen. Corrected browser32610/headless92750/health1512/focused68437/fonts12953/counters38675 are running; seven
pinned private peers pass. All original acceptance checks remain open.

October 6 scoped casing/MathML revision: permanent browser checks assert no false ordinary casing warning, plus four
same/separate-label warning scopes. Twenty direct MathML cases use five Unicode17 clusters, two fonts, plain/generated
text and sixty density snapshots. Independent original scalar geometry, token versus later-SVG sequences, base ink,
styles, links, JSON, source immutability and one shared-character-budget refusal are checked. Ten actual MathML compiles
join eight casing compiles; disposal transport checks all eighteen diagrams/288native snapshots. The new optional
`--text-transform-only` browser flag is targeted evidence, never a substitute for the default full run. Final six-file
types/lint,701focused tests, font/counter tasks and seven pinned private peers pass. Complete
browser43850/headless61920/ health15275 finish0/reaped; independent audit confirms53expected/actual/unique gates, no
missing/extra/failed/optional: root4123/42steps/5m41s, Exomux559/2m23s, web63, workers54 and87benchmarks. All1467source
inputs independently match freeze; protected/default artifacts unchanged. A read-only original MathML probe proves
ordinary RTL-override/ implicit-Hebrew glyph order is still wrong; geometry and source immutability are independent
controls for the next correction. Do not equate cluster transport with full math ordering. Format1594/scoped diff/strict
inventory/package/ release680files7.77MiB pass; final postprose/handoff checks follow without runtime/test changes. All
owned handles are terminal/reaped. Older pending notes below are chronological. All original acceptance checks remain
open.

Final handoff1594format/scoped diff/strict inventory/package/release680files7.77MiB passes. Actual1467input names/
content are independently rediscovered and equal freeze; desktop/protected files unchanged, all owned handles reaped.
Final nine-file metadata is separate from source, with no runtime/test changes after complete verified gates.

Final health14782/browser24359/headless31452 exit0/reaped. Independent audit matches53expected/actual/unique named
gates, none missing/extra/failed/optional: root4123/42steps/5m46s, Exomux559/2m22s, web63, workers54/87benchmarks.
Final701focused/22pure/font/counter/types/lint/seven pinned private peers pass. Both complete hosts preserve57fixtures/
38registeredIDs and every old oracle; headless combined text37diagrams/592snapshots. Independent1467-input membership/
content handoff equals freeze; desktop/protected files unchanged. All owned handles terminal/reaped, final prose checks
follow. Keep both failed full-host revisions/cancelled health143receipts; passing gates do not waive the new read-only
ordinary casing warning or any original full-standard requirement.

Final fragment verification adds a pre-payload getter-count limit regression (22pure tests). Second full hosts catch
keycap-plus-accents before the final whole-selector/disjoint-box guard. Final regenerated1467-source verification is
running; intermediate passing suites do not prove this final source. Both cancelled old health jobs are retained.

Current split-cluster checks independently measure base scalar geometry and original bracket interior pixels across five
Unicode17cases/twofontprofiles/HTML+SVG. Twenty pixel controls have0correct-candidate versus3044wrong-ink pixels;
20DOMcases/60native densities retain every neighboring letter, styles and links. Actual compiler/disposed transport
grows to34labels/68Markdown/544native snapshots. Pure tests cover fragments, geometry/control/ink limits, nonadjacent
collisions, independent sequences and aggregate density-work bounds. Initial full hosts reproduce Indic-conjunct
splitting in existing Unicode underline/follower coverage; the final guard preserves multi-base/variation-selector
units. Corrected frozen-source full checks are running. Exact mark outlines and every original acceptance gate remain.

Final affinity postprose23787 passes format1594/scoped diff/strict inventory/package/release680files7.76MiB.
Independently rediscovered1467runtime inputs match freeze; protected hashes/default desktop unchanged, all owned handles
terminal/reaped, metadata recorded separately. Complete automated receipts below prove this revision, not exhaustive
text shaping or full-standard acceptance.

Final HTML-affinity source passes complete browser5199/headless90332/health1121; independent health audit confirms
53expected/actual/unique gates and zero missing/extra/failed/optional: root4116/42steps, Exomux559, web63, workers54/
87benchmarks. Fonts/counters/694focused/five-source types/lint/regeneration/seven pinned private peers pass. Both hosts
retain57fixtures/38IDs and every old oracle; headless combined text transport is27diagrams/432snapshots.
Actual1467-input membership/hashes and protected artifacts match; final prose checks follow. Off-viewport
production-grapheme audit resolves the tab affinity but retains89Unicode-level disagreements versus84codepoint cases;
five new combining clusters need original-font/shaping evidence. Inconclusive1018pixel whole-label candidates do not
waive them.

The current HTML affinity slice has a permanent failed-before tab/Arabic-digit regression and an exact original
same-surface pixel control (404pixels differ for the incorrect bracket). Targeted checks retain old bidi oracles and
pass26DOM cases/18anchors, seven pixel controls, four direct probes/eight quota/source refusals,24compiler labels,
48Markdown snapshots and384native snapshots after compiler disposal. Mutation records verify lazy single-projection
caching; source DOM, application selection/focus and private-document cleanup are pinned. Fresh complete frozen-source
gates follow. Combining-mark codepoint ambiguity is not reproduced by production graphemes; advanced controls/shaping
and all original full-standard acceptance requirements remain open.

Final postprose12804 exits0/reaped: format1594/scoped diff/strict inventory/package/release680files7.75MiB pass.
Actual1467-input membership/content matches freeze and protected hashes pass; desktop SHA unchanged. Every owned handle
terminal/reaped, nine-file metadata recorded separately. Runtime/test source never changes after full verification.
Advanced text and all remaining original standard requirements stay open.

Final corrected health84157/browser37277/headless47153 exit0/reaped. Independent audit confirms53expected/actual/unique
gates, none missing/extra/failed/optional: root4116/42steps, Exomux559, web63, workers54 and87benchmarks.
Fonts/counters/ four types/three-file lint/seven peers/694focused/package/release680files7.75MiB/generators pass.
Actual1467-input membership independently rediscovered and hashes/protected files match, desktop unchanged, all handles
terminal/reaped. Corrected health uses process-local env -u NO_COLOR FORCE_COLOR=1; retain initial52/53 failure and
unchanged pinned baseline/color-enabled controls. Prose/metadata checks follow. Advanced bidi/shaping and all original
acceptance scope remain open; older pending notes are chronological.

Complete browser37277/headless47153/font/counter/package/generator/seven-peer checks pass. Corrected scratch selector
accepts singular/plural test headings: initial75-file64235 passes693, full76-file96049 passes694/10steps. Initial
health54738 is52/53, with4111root pass/five ANSI assertions failing under NO_COLOR=1/TERM=dumb; other suites559/63/54/
87benchmarks pass. Clean pinned baseline27093 reproduces all five; unchanged current75191/baseline57401 pass19 each with
env -u NO_COLOR FORCE_COLOR=1. Complete corrected health84157 is live, not a finished receipt. Preserve the original
failed health log and independently count final named gates. All1467source/protected hashes match, desktop unchanged.

Independent equal-bounds SVG mirrors now compare exact native cell/style/link frames with ordinary LTR counterparts at
three densities. Browser89151 fails before implementation;18anchor comparisons pass after, retaining all old glyph
pixels/DOM/guards. Actual compiler coverage grows to18labels/36Markdown/288disposed native snapshots. Three types/lint
and15pure tests pass; fresh full-source gates follow. Stronger pinned-font/same-surface whole-SVG comparisons match five
sampled advanced control labels exactly; a sixth differs by two pixels. HTML caret and SVG advances both have84level
disagreements over2000cases/6733positions. Preserve those normative cases and unresolved shaping; do not infer a blanket
caret bug or full conformance from these samples. Prior glyph-ink postprose72611 passes format1594/inventory/scoped diff
and package/release680files7.75MiB.

Final bidi source passes full browser75900/headless58318/health65570 exit0/reaped; independent audit confirms
53/53gates: root4116/42steps, Exomux559, web63, workers54 and87benchmarks. All old oracles/57fixtures/38IDs stay.
Fonts/counters/eight types/12-file lint/seven peers/694focused and package/release680files7.75MiB/both generators
pass;1467source/protected hashes match, desktop unchanged, all handles terminal/reaped. Prose checks follow. Independent
Unicode17 audit finds84caret/level disagreements across2000cases/6733positions; two unknown codepoint measurements and
four inconclusive cropped glyph probes are not full glyph/shaping evidence. Keep these required advanced contexts
alongside every original full-standard acceptance check.

Current bidi tests preserve logical text while checking renderedText/per-glyph ink, JSON/style/link retention,
controls/graphemes and per-field/aggregate budgets. Two native tests fail before implementation;15pure tests now pass.
Original six CSS/SVG pixel controls have zero mirrored differences versus5066unmirrored pixels. 20mixed
direction/Latin/Hebrew/isolate DOM cases and two font-only warnings pass; real compiler cases cover both label
hosts,12Markdown snapshots/96disposed native checks. Eight types/12-file lint/generator pass. Full-source gates follow;
these cases are not exhaustive CSS bidi/shaping/font/host conformance.

Final postprose41376 exits0/reaped: format1589/scoped diff/strict inventory/package/release678files7.74MiB pass.
Actual1461-source membership/hashes match freeze and protected hashes pass; metadata is recorded separately.
Runtime/test inputs do not change after verification. All remaining original full-standard gates stay open.

Final corrected-source health86205 exits0/reaped and independent audit matches all53gates: root4108/42steps, Exomux559,
web63, workers54/87benchmarks. Complete browser/headless and all targeted font/counter/types/lint/ peers/686focused
checks pass above their existing oracles. Package/release678files7.74MiB, format1589, inventory/worker reproduction
and1461source/protected hashes pass; desktop unchanged and all handles terminal/ reaped. Final prose checks follow;
prior pending notes below are chronological. Full-standard scope stays open.

Corrected browser/headless runs exit0/reaped on the1461-input freeze:57fixtures/38IDs/every old oracle. Both hosts
retain138semantic scenes/552ordinary snapshots per Markdown/flex surface/20decorated checks/four pans each. Nine
terminal decoration diagrams retain197marked cells/138240addressed ANSI comparisons. Fonts/counters, eight
types/seven-file lint/seven peers/686focused pass. Full health/audit/handoff follows. Next actual upstream RTL override
pixels prove missing punctuation mirroring: mirrored candidates differzero pixels, unmirrored forms differ117/112/122.
Four Range ordering probes alone do not prove glyph ink, full bidi levels or shaping.

Kanban transport retains the80/35-column viewports, pans to actual native marked-run columns only when ink is offscreen,
verifies mounted decoration SGR, and restores/compares the original left viewport. The disposed targeted example passes
four panned checks per Markdown/flex surface and ordinary narrow snapshots. Every old left-visible
ink/source/AX/scroll/disposal oracle stays. First complete browser/headless failures and deliberate old-source health
cancellation143 are not green receipts; corrected-source full verification follows.

Current decoration-context revision passes32original-browser cases/7guards, including five new SVG-to-HTML default/
explicit CSS ink, descendant none, atomic interruption and mixed SVG/HTML sibling controls. Preserve first browser47561
failure; no prior fixture/pixel/cleanup/native/JSON oracle is weakened. Three new pure projection tests and existing
affected checks pass31tests; six-file lint passes. Exact pinned Kanban fence2/SHA adds catalogue57fixtures/38IDs and
disposed semantic/Markdown/flex/terminal/remote checks; post-fix source audit has21black-underlined ticket cells/no
diagnostics. Full frozen-source verification is pending. These checks do not establish exact CSS geometry, every
decoration layer/filter/group ink, host capability or full-standard feature/fidelity/consumer/review completion. Allten
original acceptance gates stay open.

Final traversal/marker source passes complete browser88823/headless48194/health1489 exit0/reaped; independent audit
matches53expected/actual/unique gates with no missing/extra/failed: root4105/42steps, Exomux559, web63, workers54 and
87benchmarks. Both hosts retain56fixtures/38IDs/38grammar-negative/native recoveries and every original oracle. All61
reference cases/2196pixels/26169disposed cells/256-257bounds/zero missing-marker allocations pass.
Fonts26079/counters70997, seven-source types/eight-file lint/seven pinned peers and683focused40143/10steps pass.
All1461frozen/protected hashes match; desktop899282bytes/SHA is unchanged. Format1589, strict
inventory/package/release678files7.73MiB/worker reproduction pass; all owned handles terminal/reaped. Final
prose/format/metadata handoff passes. Earlier pending notes are chronology; full-standard
feature/fidelity/native/capability/consumer/review and allten acceptance gates remain open.

Current charged-clip/marker revision passes47focusedtests and61original-browser reference cases (43unchanged filter,
18marker)/2196pixels/26169disposed JSON-native cells. Four clip controls count actual point reads, require work
rejection before traversal and prove shared region/domain reuse; preserve their failed-before receipts. Marker controls
cover missing/type/namespace/base/encoding/tree/ownership/duplicate/external references and prove zero missing-reference
instances/nodes/style units, retaining256/257filter bounds. Seven-source types pass. The full catalogue now includes the
exact pinned vertical-timeline source:56fixtures/38IDs. Full frozen-source gates pass above; older receipts below prove
their own revision only. These tests do not prove full decorated ink, every host profile or any full-standard
feature/fidelity/consumer/review acceptance gate. Allten remain open.

Independent next-fidelity Kanban audit matches pinned source SHA and isolates three wrong ticket underlines: native
white SVG fill/purple stroke versus original black HTML ink. Decoration removal changes201pixels (195solid black), while
SVG fill/stroke changeszeroof those201pixels over1800000 original pixels. This is a reproducer, not a passing regression
or full native-geometry proof; fix and permanent context-boundary coverage remain required.

Final current source passes actual health39844; independent audit matches53expected/actual/unique gates, no missing/
extra/failed: root4101/42steps, Exomux559, web63, workers54 and87benchmarks. Complete browser19838/headless24234 pass
55fixtures/38IDs and every original oracle, including43reference/input/buffer cases/1548original pixels/18447disposed
cells and unchanged256/257bounds. Fonts37396/counters6959/seven-source types96336/eight-file lint/seven pinned peers/
679focused76489/10steps pass. All1460frozen/protected hashes match; every owned handle terminal/reaped. Package/release
677files7.73MiB/generator reproduction and format1588 pass; desktop byte-identical. Earlier pending/failure notes below
are chronology. That prior revision did not prove per-visit clip traversal charging; the current targeted controls above
address that gap. Full decorated ink, every host profile and full-standard feature/fidelity/consumer/review completion
remain unproved. Allten original gates stay open.

Current primitive-input/off-frame checks pass 41 actual-browser cases/1,476 original pixels/17,589 disposed JSON-native
cells and unchanged 256/257 list bounds; 58 focused native/filter/clip/image/text tests pass. Six new native groups and
the first browser off-frame case fail before the sparse-grid fix. Cover all four edges, offset-out/back with blur,
nested filters, measured/unmeasured wide glyphs, thin/outlined strokes, image alpha/links/post-clips, generated
primitive paint, million-cell empty gaps and existing work/precision/retained limits. New semantic comparisons normalize
RGBA, not source CSS spelling; original oracles remain unchanged. Full final-source verification follows. Earlier
complete handoffs below prove their own revisions only; all original full-standard gates remain open.

Final corrected filter source passes health84471; independent audit matches53expected/actual/unique gates, no failure
(root4091/42steps, Exomux559, web63, workers54/87benchmarks). Complete browser12173/headless37000 retain55fixtures/
38IDs and every original oracle, including45wide cases/405repaints/2044pixels, six root pixels, and new24reference
cases/864pixels/10296disposed cells/256-257bounds. Fonts69913/counters74193/six-source types80583/seven peers/
669focused46208 pass. All1459source/protected hashes match; every handle terminal/reaped, desktop byte-identical.
Lint/generator/inventory/package/release pass; final prose/format/metadata handoff passes. Preserve first browser
failure and deliberate old health cancellation; neither is green. Full-standard and allten acceptance gates remain open.

First complete browser27389 fails three scene oracles because original and compiler SVGs share IDs concurrently.
Separate their measuring lifetimes; preserve all original colors, samples and borrowed-resource denial. Headless7738/
types99903/seven peers pass; deliberately cancelled known-invalid owned health56200/143 is not green. Corrected1459
inputs run browser12173/headless37000/health84471; six-source types80583 pass. Original directory listing independently
finds34docs; all546fences produce545compiles/3446740visible native cells,11diagnostic cases and one default-denied image
failure. Compilation/visibility is not visual fidelity. Next original-pixel audit has four primitive-input and one
off-frame mismatch, not fixed in this freeze.

Current local-filter checks independently compare original DOM pixels with JSON-native output:24cases/864pixels/
10296cells after DOM disposal and unchanged256accepted/257rejected list bounds pass, withzero missing-reference nodes.
Four measured-policy/cache/capability/cleanup plus13native filter tests and changed-source types pass. Namespace, base
URLs, CSS/UTF-8/BOM IDs, duplicates, shadow isolation and borrowed/external denial are explicit. Chromium's actual
skip-function behavior contradicts normative whole-chain invalidation; a detached finally-cleared1x1Canvas probe
measures policy, never UA-guesses or suppresses unavailable-host diagnostics. Full-source verification follows. Preserve
every original source/AX/pixel/native/remote/ANSI oracle; allten full-standard gates remain open.

Current lifetime source passes full health96743; independent audit matches all53gates, root4087/42steps, Exomux559,
web63, workers54/87benchmarks. Complete browser15705/headless40203 retain55fixtures/38IDs and every original source/
native/remote/ANSI/AX/pixel oracle. Permanent71case actual SDK parity,20rejections/zero SDK errors/21closed workers,
CDP-paused active abort/disposal, ten-entry cache, actual30s timeout and owned URL cleanup with borrowed URLs preserved
(including worker-src none) all pass. Fonts15142/counters37324/five types54924/seven peers/665focused61201 pass. Format,
seven-file lint, generator reproduction, strict inventory/package/release and1457frozen/protected hashes pass; every
handle is terminal/reaped. Preserve both initial capability-test failures and deliberately cancelled old-source health/
headless jobs, never call them green. Full-standard/whole-SDK/native capability/consumer/review gates stay open.

The next filter audit uses original upstream sequence SVG pixels, not native output as its own oracle: the unscoped
missing #drop-shadow note equals explicit none at1280x720/zero differing RGBA channels. Permanent local missing/wrong-
type and mixed-chain cases were initially expected to discard the whole chain per Filter Effects §5. Actual later
mixed-chain pixels supersede that assumption: match measured host policy without waiving valid filters, external/
borrowed-resource policy or node/pixel budgets. No filter production change belongs to that earlier lifetime freeze.

The ZenUML lifetime audit measures the actual SDK error-array object through private CDP: rejected errors persist across
valid parses. Do not equate source-size limits with bounded retained parser state. Generated grammar source-map/file
hashes and pinned runtime must reproduce; actual SDK acceptance/first diagnostics, twenty default rejections, valid
cache, worker-close counts and CDP-paused caller-abort/compiler-disposal recovery are permanent browser oracles. Four
DOM-free official grammar/budget/abort/recovery tests and six existing factory tests pass early; corrected scratch audit
proves all21workers close with no SDK-error growth. Fresh complete frozen-source verification follows; whole SDK
decoded/layout memory and every original full-standard/consumer/review gate remain unproved.

Corrected final-source health20044 exitszero/reaped; independent audit matches53unique gates, root4082/42steps,
Exomux559, web63, workers54 and87benchmarks. Both complete hosts retain all original oracles and pass55examples/38IDs,
38 parse/compile/native recoveries,168flex compiles/337snapshots, six root viewport pixels and both new/borrowed
SDK-style ownership realms. Fonts/counters/fourtypes/16-filelint/sevenpeers/660focused pass. All1452 handoff inputs and
protected hashes match; exact checksum reconstruction proves only the automatically normalized linked noble declaration
changed after freeze, without a resolution record change. Format1580/package/release/inventory pass. Every handle is
terminal. Next measure SDK rejected-parse retention; source shows Errors is not cleared though ErrorDetails is. This is
not evidence of bounded whole-SDK memory or full feature/consumer/maintainer acceptance. Allten original standard gates
remain open.

Preserve initial full compiler failures from the SDK's injected legacy CSS and the deliberate known-invalid health
cancellation (44711/143). New failed-first next-family counter recovery plus fresh private borrowed/same-sized/owned
stylesheet and no-viewer tests guard exact-hash SDK cleanup. Test insecure virtual HTTP as well as localhost/HTTPS;
existing CSS caps and host styles cannot be waived. Refreeze corrected source and repeat every complete gate.

The ZenUML continuation adds actual failed-before/fixed-after body validation, exact provenance for all sixteen pinned
examples, 38-family negative/native recovery and disposed JSON/native scenes. Root viewport tests independently specify
normal/rotated meet letterboxes and visible overflow, retaining cleanup and every original oracle; original browser
pixels separately compare clip policy. The actual 363.5x457 comment overflow is upstream-clipped, not repaired by
inflating native dimensions. New common-preamble metadata regression fails first. Complete frozen-source verification is
next; earlier green receipts concern their own revisions. All full-standard acceptance gates remain open.

Final metadata handoff is complete: formatting (1,577 files), scoped diff, package and release dry-run pass. All 1,449
frozen inputs and owner/consumer/download hashes still match. Every owned handle is terminal/reaped. Earlier
pending/failure notes below are revision-specific chronology, not current jobs; all original full-standard requirements
and ten unchecked acceptance gates remain open.

Final current-source verification passes: actual health 30897 independently matches 53/53 gates (root 4,077/42 steps,
Exomux 559, web 63, workers 54; 87 benchmarks), both complete compiler/font/counter hosts, four types/five-file lint,
seven pinned peer scenarios and 635 focused tests/ten steps. Both hosts prove 37 parse/ compile rejections and
next-valid native recovery without discarding original source/AX/pixel/remote/ANSI oracles. All 1,449 frozen inputs and
owner/consumer/download hashes match; default desktop is still 899,282 bytes. ZenUML is documented but absent from the
default registry. An isolated 8,875,236-byte extension prototype compiles all sixteen pinned examples; one text-bounds
warning remains. Next integrate it and verify all original feature/fidelity/ width/shaping/capability/consumer/review
requirements. All ten full-standard acceptance gates remain open; built-in catalogue coverage cannot hide missing
documented extensions. No owner-plan, consumer/service/daemon, push or publication change. Receipts:
projects/.scratch/mermaid-grammar.X7nIhC/.

Task 050's width continuation is verified: 1,447 matching inputs, both complete compilers/fonts/counters/four types,
seven pinned peer scenarios, 633 focused tests and independently matched actual health 53/53 (root 4,075/42 steps,
Exomux 559, web 63, workers 54/87 benchmarks). Preserve the initial Chromium-startup failure and separate retry. A
32-document sweep compiles 520/521 fences but retains image/icon/filter limitations; this is not fidelity evidence. Both
new error regressions fail first. An owned headless facade now preserves bounded data-only diagnostics instead of cyclic
parser state; ten initial transport tests and two strengthened final tests pass. Both conformance hosts gain
proper-body/context negatives and next-valid visible native recovery for all 37 registered parsers. Fresh metadata/
frozen-source complete verification follows. All original full-standard/feature/fidelity/width/shaping/capability/
consumer/review gates remain open. Owner plans, consumer/previews/services/daemon and publication are unchanged.
Receipts: projects/.scratch/mermaid-grammar.X7nIhC/.

Current scalar-width source passes exhaustive Unicode 17 narrow-policy comparison (1,112,064 scalars), retaining exactly
26 RI and five modifier exceptions, plus 245 focused native/layout tests/ten steps after four reproduced failures.
Assigned W/F uses a reviewed 130-range projection rather than approximate blocks; new real SVG/HTML captions preserve
all original compiler/remote/ANSI/pixel oracles. Default desktop remains 899,282 bytes under the unchanged ceiling.
Fresh frozen-source complete verification follows. All original full-standard/host width/shaping/capabilities/family/
fidelity/negative-grammar/consumer/review gates remain open. Earlier green receipts below concern their own revisions.

Final corrected native-boundary verification is terminal zero/reaped: independently audited health 78707 matches all 53
expected/actual/unique gates (4,071 root/42 steps, Exomux 559, web 63, workers 54; 87 benchmarks, zero failures).
Complete browser/headless/font/counter hosts, four script types, sixteen-file lint, 629 focused tests/ten steps and
seven actual pinned private peer scenarios pass. Both hosts retain all 39 fixtures/37 IDs, original source/remote/
pixel/AX oracles and 122,880 additional addressed ANSI-cell/style comparisons. All 1,445 frozen inputs and owner/
consumer/download hashes match. Every owned handle is terminal/reaped. Default desktop is 898,777 bytes under the
unchanged 900,000 ceiling. Earlier failure/pending notes below are revision-specific chronology, not current jobs.

This completes the bounded native input/cell-transport continuation, not the full standard. Keep all ten original gates
open. The read-only scalar audit finds 8,495 assigned wide scalars measured narrow by legacy display helpers, alongside
separate ambiguous/neutral/unassigned and emoji-tailoring policy differences; its 66,364 total differences are not a
claim of 66,364 shaping bugs. Next complete host-selectable width/shaping/capability behavior and feature-by-feature
family/negative-grammar evidence, retaining every fidelity, consumer and maintainer-review requirement. No owner-plan,
consumer/service switch, live daemon, version bump, push or publication. Receipts:
projects/.scratch/mermaid-native-labels.uWZnyh/.

The new actual Mermaid ANSI-cell/style oracle exposes combined-SGR bold leakage in both complete hosts, despite 628
focused tests/ten steps and green fonts/counters/types/seven pinned peer scenarios. Preserve strict original cell/style
comparisons and add an independently failing combined-attribute matrix. Shared atomic SGR parsing permits reset elision
only for complete color-only prefixes; channels/colon groups never become attributes. Forty-four narrow tests pass.
Purposefully cancel only verified owned health PGID 2939637 for this known invalid revision (85026/143), not a timeout
or full-health receipt. All first jobs are terminal/reaped. Regenerate, freeze corrected source and repeat every
complete check; all original full-standard/consumer/review requirements remain open.

Latest native-boundary work preserves the original intrinsic eight-column tab expectation and raw zero-control widths;
112 layout/API tests and strict inventory pass after exactly two symbol additions. Both direct UTF-16 regressions and
both real ANSI sink regressions fail before their implementations. One-unit pending UTF-16 state preserves every string
split, empty writes, first styling and byte/string resize parity; explicit flush/clear are independently checked. Both
addressed sink paths preserve leading marks, Prepend, independent emoji/RI/Hangul cells and empty wide followers through
three-byte writes. Mounted independent TextObjects also pass. Corrected native/layout selection is 231 tests; complete
compiler fixtures now retain all original source/raw-ANSI/remote/pixel checks and additionally compare both actual sinks
against exact original cells/styles. Final-source complete verification follows. Previous corrected-source health is
authoritatively 51/53 (stable inventory plus authoring-tab test), despite 490 focused passes and complete hosts. Keep
all ten original standard and real-terminal/consumer/review gates open; do not conflate model tests with shaping or
recovery of cell metadata absent from raw concatenation.

Initial native-label compiler/font/counter/type/lint jobs are terminal zero/reaped; both complete 39-fixture/37-ID hosts
retain 137 scenes/548+16 snapshots, eight nested diagrams/178 decorated/61,440 original plus remote cells and browser's
22-grapheme/twelve-wide/22,720-cell/20-frame checks. Focused 92400 finishes 488/ten steps plus one historical
zero-control expectation. All twelve immutable golden cases are audited; exactly the prior CRLF and newly intentional
zero-control case differ. Pin both old/new bytes/UTF-16 offsets for that case, retain every other fixture and add
independent BEL/source-offset checks. Six wrap tests pass. Initial health 79501 is cancelled/reaped (143) solely for the
known fixture failure, not an observation timeout; no whole-health result is inferred. Corrected freeze and fresh full
verification follow. Production remains unchanged; these partial receipts do not establish any full-standard gate.

Current native-label selection passes 132 tests/ten steps after four reproduced failures. It compares all Unicode
scalars with the independently pinned zero-width profile, all 766 official cases with the text-free boundary cursor,
65,536-unit normal/insert/REP labels, every existing UTF-8/SGR/width/wrap case, first-style zero-prefix/visible
clusters, 1,200 deterministic ledger edits, whole-cluster budget refusal, saved screens/history/resize and copied full
labels. The old cap fixture preserves exact 64-accent input and now asserts explicit overflow replacement, not silent
loss. Real SVG/HTML fixture captions add narrow/wide clusters above sixteen units without dropping any original
glyph/source/ pixel oracle. Complete frozen-source/compiler/font/counter/focused/health verification follows; prior
green totals are not current proof. Grid/style/decoder/caller memory, direct UTF-16 chunk seams, zero-prefix ANSI
padding, full terminal width/shaping/capabilities and every original standard/consumer/review gate remain open.
Receipts: projects/.scratch/mermaid-native-labels.uWZnyh/.

Final metadata handoff passes formatting (1,565 files), scoped diff and package/release checks; all frozen source and
owner/consumer/download hashes still match. Every owned handle is terminal/reaped. Pending notes below are chronology,
not remaining work on this remote slice; all original full-standard requirements remain open.

Final remote-source verification: whole-health 74548 exits zero/reaped, independently matching exactly all 53 gates,
4,043 root/42 steps, Exomux 559, web 63, workers 54 and 87 benchmarks. Both complete compiler hosts, font/counter hosts,
466 focused tests/ten steps, ten-file lint/four script type checks and seven actual pinned compatibility scenarios pass.
Both compilers retain the full 39-fixture/37-ID catalogue, original source/AX/fidelity oracles and 61,440 remote/native
source cells/16 remote frames; browser also verifies 22,720 remote cells/20 frames against original pixels. All 1,437
final frozen inputs and owner/consumer/download hashes match. Every owned job is terminal/reaped; older pending/failure
receipts below are chronology. Final metadata checks follow prose reconciliation. This does not establish the remaining
native standalone-width/cluster-cap, shaping/family/fidelity/consumer/review requirements or any original standard gate.

Current remote regression total is 24: add failed-before/passed-after v1 adjacent lone-surrogate run partitioning across
same-style cells/rows and changed spans. Actual compatibility now has seven scenarios, adding a new-host/old-client
full/delta/coalesced/resize/resync/reconnect case for those cells. JSR requires explicit public limits typing; never
waive its slow-type check. First health is independently 51/53 (root implicit-v1 fixture plus release slow type); the
explicit-v1 correction preserves its original version/style oracle. Corrected health 35968 is 52/53 with 4,042 root/42
steps and all other suites green, but an earlier-loaded release slow-type failure. Separate release succeeds after
annotation. Pre-surrogate typed-source complete hosts/font/counter/465-focused/lint/types pass on 1,437 matching inputs;
final-source verification follows. All older receipts are revision-specific.

**Explicit remote cells (current source).** Six regressions first fail and then pass; ten additional tests exercise
opaque UTF-16/empty cells, v1 shape/rejection, ready-handshake intersection, distinct stale/corrupt checksums, malformed
payloads/lengths/palettes/spans, allocation/aggregate limits, immutable snapshots, transactional windows/ACKs/resync and
120 randomized JSON updates. Existing codec/flow tests also pass (23 total).
`deno run -A scripts/remote_frame_compatibility.ts /absolute/clean-old-checkout full-pinned-sha` starts separate actual
old/new module processes over private TCP with private XDG state. Six scenarios prove both v1 directions, new/new v2,
fallback and both mandatory rejection directions; successful pairs reconnect and each check ten exact source frames/ two
resyncs, while rejects send none. An actual old decoder rejects an explicit v2 probe.

Real disposed Mermaid Markdown now crosses JSON full/delta before all nested-terminal source/style comparisons and
browser wide-glyph pixels/scroll/resize checks, preserving original ANSI bytes as an independent oracle. Complete
compiler/font/counter/focused/whole-health checks on the final frozen source remain pending. This is not full terminal
shaping/width/capability or full-standard completion. Raw ANSI/PTY and live daemon transports are untouched. Receipts:
projects/.scratch/mermaid-remote.su1UT5/. Older verified receipts below concern earlier source.

Final corrected grapheme verification: whole-health 52181 finishes zero/reaped and independently matches all 53 named
gates, root 4,026/42 steps, Exomux 559, web 63, workers 54 and 87 benchmarks. Corrected complete compiler hosts,
font/counter hosts and 410 focused tests/ten steps pass on all 1,432 matching final inputs. All handles are terminal;
older pending notes below are chronology. Eight render files pass normal lint; the old wrap oracle's intentional control
regex is unchanged from HEAD and passes with that rule explicitly excluded. Final format/scoped diff and package/release
checks follow prose reconciliation. This is verified bounded transport, not full width policy, large terminal cluster
support, remote wire parity or any original full-standard acceptance gate.

Grapheme first broad run is not green: 52/53 gates, root 4,025 passed/42 steps/one failed; all other suites and 87
benchmarks pass. Only one of twelve pre-fast-path wrapping snapshots differs, because CRLF crop no longer returns its
CR. Keep the immutable historical fixture, explicitly verify both old and corrected values for exactly this case, retain
byte-identical comparisons for all others and pin plain/styled crop at widths 0/1/2/3/20. Nine narrow checks pass. This
semantic correction has explicit pre-1.0 notes; no production edit follows the initial freeze. Corrected complete
verification remains pending. First compiler/font/counter/focused/type runs are terminal/reaped and match all 1,432
initial inputs; do not infer final-source gates from these earlier receipts.

**Pinned grapheme transport.** Four shared-helper regressions first fail, then compare all 766 official Unicode 17
fixtures in plain/outer-SGR/per-scalar-SGR forms (2,298 independent boundary expectations), widths/cropping and actual
Canvas cells. Six terminal regressions cover every UTF-8 split, base style, Indic/Hangul/emoji/RI joins, width-growth
followers/cursor/REP, insert mode, whole-margin wrap and no-wrap/one-cell clipping. Existing per-cell sixteen-unit
memory limits stay in place. A native keycap/overlay regression catches the ASCII-base compositor shortcut. Actual
SVG/HTML labels preserve long accents/conjuncts/Hangul/keycaps after compiler disposal; nested terminal checks compare
61,440 source Markdown cells before comparing mounted styling (eight diagrams/170 decorated cells). Focused checks pass
140 tests/ten steps. Complete hosts/health on final source are pending. This does not establish an unbounded terminal
cluster guarantee, full Unicode width policy, remote wire/version parity or full-standard completion.

Final wide-span verification: whole-health 6022 finishes zero/reaped, and an independent name audit proves exactly all
53 configured gates (4,015 root/42 steps, 559 Exomux, 63 web, 54 workers/87 benchmarks). All 1,430 frozen inputs match
after generation. Complete compiler/font/counter/focused/lint/type receipts below are terminal/reaped; interim pending
notes preserve chronology. Eight new unit tests plus actual compiler/browser fixtures verify the fixes, not complete
Unicode segmentation, remote version compatibility or any original full-standard acceptance gate. Final formatting,
scoped diff and package/release metadata are checked again after plan reconciliation.

Current wide-span frozen-source receipts: 307 focused tests/ten steps and seven-file lint/types pass. Both complete
compiler hosts finish zero with all 39 fixtures/37 IDs, 137 scenes/548 snapshots per surface plus sixteen marked per
surface, eight nested terminal diagrams/151 cells and actual browser disposed Unicode transport (two diagrams/ten
frames/six wide glyphs). Original AX checks compare 137 actual/115 direct trees. Font/counter hosts finish zero. All
1,430 frozen inputs match; whole-health 6022 is still live. Read-only audit distinguishes v1 full/delta segmentation
loss from stale-base errors and checks longer marks/Indic/Hangul against pinned UAX #29; these next fixes require exact
native/remote round trips and old/new compatibility, not merely current ASCII/emoji coverage.

**Browser wide spans.** Seven new unit tests cover literal/styled continuation markers, reverse update order, separate
ranges, dirty follower/owner restoration, replacement tails, combining/ZWJ glyphs, ordinary blanks, orphan/right-edge
clipping, resize, byte snapshots and transactional allocation bounds. Actual TextObject mounting is required; its first
failure reveals styled rather than literal empty followers. All 23 focused tests pass after correcting production.
Permanent real Canvas2D checks pass 45 cases/405 exact clean-versus-incremental comparisons at DPR 1/1.5/2, 2,044
independently painted second-cell glyph/line pixels, narrow-font overhang and 24 TextObject replacement/reflow/redraw
frames. SVG/HTML Unicode Mermaid labels add actual compiler/native/disposed Markdown/browser checks; final compiler and
whole-health receipts remain pending. These tests do not establish remote Unicode wire compatibility or exhaustive font
geometry/full-standard support. Receipts: projects/.scratch/mermaid-wide-spans.wQX5f0/.

The eighth new regression drives styled ASCII accents/keycaps/ZWJ through actual Canvas storage. Real compiler Unicode
fixtures expose the ASCII shortcut splitting combining marks; inspect that failure and correct production without
weakening the mounted style oracle. Focused checks pass 36 tests/ten steps. Eight actual diagrams pass disposed native
Markdown/flex (32 snapshots each/sixteen marked each) and nested terminal transport (151 cells). Final complete hosts
and broad gates are still required on the corrected source.

**Nested terminal decoration transport.** Nine new tests preserve five underline styles/ink, RGB-zero attributes,
colon/subparameter atomicity, ordered resets, malformed/private controls, every byte-boundary split, wide follower
integrity, styled scrollback/resize/JSON/alternate/copy and background-only erasure. Actual TerminalScreen mounting
checks decoration-aware identity and plain replacement; prepared Mermaid/Markdown travels through the same model,
component, unchanged full/delta remote codec and browser paint. Palette cases verify position-dependent inverse,
independent ink, cursor and inactive dimming. A mounted fake-client Exomux fixture verifies all styles and styled copy
history without touching real PTYs. Initial focused runs pass 95 root and 105 Exomux app/resize checks. Both complete
compiler hosts include actual captured diagrams through the nested terminal after compiler disposal; final-source
verification passes below. Exact CSS geometry and terminal capability detection remain independent requirements.

The corrected continuation adds two WidgetSurface regressions for inert host handles and atomic color-reader
consumption. Actual Chromium catches the missing Deno handle; six real class/flow diagrams use the prepared Markdown
style adapter after compiler disposal and preserve 112 decorated cells with erase cleanup. Both complete hosts now run
that probe. Eight-file lint/types and 428 focused/API tests pass on 1,428 frozen inputs. Both complete compiler hosts
pass all 39 fixtures/37 IDs, original pixels/AX/native transport and font/counter checks. Corrected whole-health
finishes all 53 independently matched gates: 4,007 root/42 steps, 559 Exomux, 63 web, 54 workers/87 benchmarks. Every
handle is terminal/reaped, all frozen inputs match, formatting checks 1,556 files and scoped diff checking passes.
Twenty independently run @xterm/headless@6.0.0 cases match typed attributes/ink; its disabled-underline public ink
accessor follows foreground, so explicit-ink checks use enabled/re-enabled cases. A separate actual Canvas2D wide-glyph
audit proves 42/98 missing second-cell glyph pixels and ten missing underline pixels per glyph. That span/dirty-recovery
gap is next work, not implied solved by model transport.

The independent remote audit also reproduces version-1 run text losing empty wide followers and splitting combining
graphemes; both exact payloads request resync. ASCII opaque-style round trips are not evidence for those cells. Future
wire changes need bidirectional version-skew tests; raw ANSI/PTY transport remains a separate path.

**Extended decoration transport (verified partial capability).** Shared SGR regressions reproduce RGB-zero resets,
discarded colon styles and out-of-order resets. Pure tests cover five styles, named/indexed/RGB ink, malformed atomic
colors and real Canvas TextObject storage/replacement. Native/mounted Markdown/flex tests check separate underline ink,
five distinct same-foreground palettes, overline, disposed JSON preparation, reflow and unstyled copy; layered/
strike/overline/filter/group/alpha limits remain positive diagnostic cases. The original thirty-case browser audit
proves five distinct masks for each SVG/HTML underline/strike/overline group; padding fixes an initially clipped HTML
overline fixture without loosening visibility requirements. The permanent browser fixture adds ten raw SVG/HTML cases;
real Canvas2D checks five distinct patterns, independent green underline/blue overline, stable dirty-cell phase, plain
repaint cleanup and inverse ink. Corrected-source checks pass all 329 focused/API tests, twelve-file lint/types and both
complete 39-fixture/37-ID compiler catalogues. Both hosts retain 135 scenes and 540+12 snapshots per surface; browser
compares 135 actual/115 direct AX trees. Font/counter hosts pass. Fresh whole-health finishes all 53 configured gates
independently matched: 3,996 root/42 steps, 558 Exomux, 63 web, 54 workers/87 benchmarks. All 1,426 frozen inputs match
and every handle is terminal/reaped. The isolated terminal-host audit nevertheless loses all decoration plus glyph
color/bold; require typed SGR state/model/component/remote regressions next. This current direct-cell/browser evidence
does not certify nested terminal parity, exact geometry or original full-standard acceptance.

**Decorated text (verified partial capability).** Four pure tests cover portable underline/strike flags,
positioned/wide/ MathML glyphs, nonconventional descriptors/budgets and foreground ownership; two mounted tests pin
palette distinction, real wheel/reflow/pan/wide clipping, plain copy and panel replacement. Two browser tests check SGR
toggles/resets/RGB channels, actual font-cache keys, clipped glyphs, whitespace lines and repaint cleanup. A marker clip
regression keeps visible text from being rejected by snapped-origin samples. All 322 focused/API tests pass after a
test-only type-import lint correction; fifteen changed files pass lint and all 1,424 corrected input hashes match. The
browser compares untouched original/restored/decoration-only-disabled pixels for seventeen SVG/HTML/use/marker cases,
including independent ink colors; five guards cover read-only/cache/depth/layer/borrowed Window and nine real Canvas2D
samples prove painted lines and cleanup. Six actual static-class/flow cases also run in both engine hosts; disposed
transport adds twelve real marked style snapshots to each surface's existing 540 snapshots. Both complete compiler
catalogues finish zero with 39 fixtures/37 IDs and 135 actual/115 direct AX trees. Font/counter hosts pass. Final-source
whole-health finishes all 53 configured gates independently matched: 3,989 root/42 steps, 558 Exomux, 63 web, 54
workers/87 benchmarks. All 1,424 frozen inputs match and all handles are terminal/reaped. Original compiler-stage
inspection proves SVG inner spans explicitly set normal font style; parent italic is not the leaf's used style. Keep
this upstream behavior distinct from the proven underline loss. Earlier 53-gate receipts validate the preceding
source-config revision, not these production changes.

**Source configuration preservation.** Five pure tests cover owned directive JSON escaping, effective versus raw config,
custom-runtime capability behavior, official parse/abort failures and bounded encoding/recovery. The untrusted-policy
test preserves extra host secure keys. Independently authored actual cases cover YAML blocks/folding/escaped keys/
aliases, init/initialize directives, precedence, visible/accessibility titles, apostrophes/percent/terminators, layered/
variable/nested counter content, locked decimal/plural CSS, forced strict policy and deliberately filtered CSS. Both
engine hosts retain original source and disposed Markdown/flex snapshots; the browser compares original/real-companion
AX trees. SVG-only compilation also preserves valid metadata. Both full catalogues pass all 39 fixtures/37 IDs, 23
source-config cases, 129 actual/115 direct AX trees and 516 disposed snapshots per document surface. All 292 focused/API
tests, font/counter hosts, lint/types and 1,419 frozen inputs pass. Fresh whole-health terminates zero with all 53
configured names independently matched: 3,980 root/42 steps, 558 Exomux, 63 web, 54 workers and 87 benchmarks. All
frozen inputs match after validation; receipts: projects/.scratch/mermaid-source-config.Gvo0q9/. The separate read-only
class-doc audit compiles all 38 pinned example fences without diagnostics; captions/diagnostics alone are not proof of
every documented style, grammar, native/semantic transport or visual fidelity. Separate original browser pixel
comparisons prove missing underlines despite zero diagnostics: 252 static-class pixels per look, 380 with SVG labels,
and 68/136 on HTML/SVG flow labels. Require native/Markdown/flex decoration regressions and original-stage investigation
of the fresh-page SVG italic discrepancy before claiming class-feature parity.

**Native counter metadata and font provenance.** Seventeen independently authored source CSS cases compare original AX
before capture with native/semantic text, restored source AX and a real DocumentAccessibilityDOM companion afterwards.
Ten guards cover raw empty-plural metadata, callback/registration/adoption cleanup, host-added sheets, source-less or
mutated-sheet refusal/recovery, selection/focus, resource-free projection and source bounds. Keep the actual upstream
plural-loss audit separately: themeCSS CSSOM serialization loses plural syntax before SVG creation; owned variable
indirection must preserve original/native 249:inside. Upstream's deliberate @counter-style filter is a negative actual
engine case, not positive custom-style coverage; raw authored SVG OZO:inside remains positive. Initial complete compiler
runs expose a Haitian-quote layout shift despite identical computed fonts. Independent unchanged-SVG trials isolate
reserialized font-feature-settings and then font-size in a separate default-serif original. Matching inheritance fixes
exact source layout, without increasing tolerance. Four actual/direct cases cover inherited/distinct features, distinct
size and important-layer quotations. Current final-source checks pass 106 actual/115 direct semantic trees and 424
disposed Markdown/424 flex snapshots, counter/font hosts, 286 focused tests, lint/types and 1,416 matching hashes. Both
complete compiler catalogues finish zero, all 39 fixtures/37 IDs. Fresh whole-health finishes all 53 configured gates:
3,974 root/42 steps, 558 Exomux, 63 web, 54 workers and 87 benchmarks. All 1,416 frozen inputs still match; receipts:
projects/.scratch/mermaid-layout-regression.krk2nJ/. A next independent actual configuration audit proves host plural
preservation but retains front-matter/directive 9:inside versus required 249:inside. These checks prove this partial
native revision, not original full-standard acceptance.

**Read-only counter state.** Seven pure tests cover computed directive order/duplicates/escapes, ancestor/sibling reset
inheritance, detached nested snapshots, containment writes versus reads, set precedence, overflow, explicit reversed
initialization and bounded refusal/recovery. The counter browser task adds 35 independent original AX-text cases in both
default Chromium and explicitly enabled CSSListCounterAccounting/CSSCounterResetReversed profiles. Assert syntax support
in each: disabled reversed syntax is not a positive feature fixture. Thirteen guards per profile cover source markup,
focus/backward selection, request/token/node/depth bounds, early stopping before 33,000 following nodes, fresh recovery,
open/accessibly closed shadow ancestry, slot order and a same-origin Window. Preserve the first three
list/display:contents mismatches; fix the model, never normalize original text. Original empty-separator content is
explicitly supplied in one fixture; this state oracle does not certify native counter materialization or restore lost
CSSOM plural metadata. Final whole-health/compiler verification passes all 53 gates (3,966 root/42 steps, 558 Exomux, 63
web, 54 workers) in projects/.scratch/mermaid-counter-context-final.p02YAA/; 276 focused/API/contract tests, lint/types
and all 1,389 frozen input hashes pass. This proves the state-only revision, not later native integration.

**Counter formatting foundation.** Nine pure tests cover the seven style systems, predefined numeric/alphabetic/Roman/
fixed output, ranges, signs, grapheme padding, greedy additive failures, descriptor inheritance/cycles, safe CSS token
decoding, nested functions, slash alternatives and refusal/recovery. `deno task mermaid:test:counters` mounts separately
authored original CSS and compares actual AX text with 2,670 formatter predictions across 76 style names/twelve content
cases; two oversized examples independently prove the existing 4,096-unit refusal. Keep the 84 initial CJK/square
mismatches and the empty-separator loss fixture: counters(probe, "") exposes 249 in original AX but serializes to
counter(probe), which predicts 9. The formatting matrix checks authored function text and records that unresolved
computed-only loss explicitly. It does not prove original host counter-state capture, complete complex/anonymous style
or cascade resolution, native paint/companion fidelity, other-browser data or full-standard completion. Final combined
verification for the previous formatting-only revision passed all 53 gates and 1,385 matching hashes in
projects/.scratch/mermaid-counter-styles-final.9bSN8K/. Current state-continuation checks are separate above.

**External quotation context.** Twenty-eight original browser AX-text fixtures precede all capture, then compare
restored source and real companion text exactly. Cases cover preceding/ancestor/following order, silent/hidden/none
content, containment inheritance/isolation, closed details/content visibility, replaced/SVG nonboxes, markers, shadow
roots and reordered/text-only slots. Captured scene text, actual native quote glyphs, JSON and unchanged source markup
also match. Seventeen guards pin bounded traversal/depth/token/source/aggregate work, early stopping before 33,000
following elements, selection/focus/throw cleanup, recovery, authored host attribute ownership and a borrowed
same-origin Window. The tests retain failed assumptions rather than normalize source text or relax geometry. Final
combined verification passes 243 focused/API tests, both complete compiler/font hosts and all 53 health gates (3,950
root/42 steps, 558 Exomux, 63 web, 54 workers) on 1,381 matching input hashes. Receipts:
projects/.scratch/mermaid-quote-context-final.Ik7vQM/. The separate actual/direct comparisons retain exact AX trees for
85/94 cases; quote-context tests assert exact text, not complete tree structure. Other quote profiles, inaccessible
off-path closed contexts, full marker ink and every original task-050 capability remain required. A fresh independently
mounted actual-engine SVG counter audit preserves 5:inside versus native inside with a counter diagnostic.

**Overlapping window glass (053).** Four tests pin Exomux's exact shade/ordinary-ink impression colors, recursive
three-window composition, no self-alpha accumulation or lower-glyph leakage, solid windows and resampling after a real
titlebar drag. The example's shared window host requires closing prior fixtures through actual chrome input. The same
animation browser oracle independently captures opaque upper grounds and exposed lower styled cells at 65% opacity, then
checks 32 restored upper-cell backgrounds against arithmetic computed from those captures. Run against default Pages and
both consumer HTTP/HTTPS builds; wallpaper-only samples are insufficient. Existing Exomux overlap/chrome, desktop
copy/history, scroll/resize and packaging gates remain required.

**Portable window animations (052).** Nine deterministic adapter tests cover baseline/coalesced open, styled taskbar
flights, live-client painting during incoming suppression, focus raise/lower clipping, maximize/unmaximize, every shared
effect/random, rapid reversal, incoming drag cancellation, off/reduced-motion/resize cleanup, persisted-value validation
and Unicode column safety. The existing 19 engine/coordinator tests and desktop host/UX tests remain required.
`deno task desktop:animations:browser` serves the actual default Pages build on isolated loopback, or accepts a consumer
URL. It uses real launcher/chrome/client clicks, compares animated/settled native grids, changes and reloads the real
persisted Settings, and probes reduced motion in a separate context. It selects plain/unwarped presentation and slow
timing for the headless cell oracle; normal timing is deterministic-test covered. GPU/shader/hardware aesthetics need
owner review. Tech-stack reuses the same oracle through `test:animations`; its HTTPS invocation may pin only the
development certificate with `TECH_STACK_TLS_SPKI`. Keep native history/scroll/resize/copy and secure-host checks.

**Shared desktop UX (051).** Six portable tests cover focus-before-release, Unicode/cell-local selection, context-copy
snapshots, scrollable launcher links, exact 1920/1280 pixel defaults (including unchanged cell dimensions), modal
centering/flashing/blocking/repeat degauss, bounded default noise, Small output against an independent FIGlet oracle,
and saved-rate migration. `deno task desktop:test:browser` serves the actual default build on isolated loopback, checks
real clipboard bytes and context-copy, Small editing/output and zero automatic microphone requests. Tech-stack's
`test:desktop-ux` checks actual card selection without navigation, HTTP copy events, all product/export menu entries,
export bytes and exact guide/product breakpoints. Existing native row/resize/subpath tests remain required. Headless
checks do not replace owner hardware/theme/shader visual review.

Final task-051 verification passes 59 focused desktop/document tests, the default/consumer browser checks and all 53
health gates on 22 unchanged hashes: 3,927 root/42 steps, 558 exomux, 63 web and 54 worker tests. The three old
Standard-height expectations in the first run were updated for the explicit Small preset change; exact mounted
row/resize/semantic comparisons remain. This desktop task does not certify full-standard Mermaid completion.

**Quotation keywords and host locale data.** Nine pure tests cover explicit/auto systems, nested/repeated/underflow
depth, silent/none behavior, unknown-function depth, inert strings and quotas. Twelve authored actual/direct quote
fixtures cover styles, MathML, alternatives, hidden/display-none boxes and Chromium's retained contain:style depth; six
additional real-engine/direct cases cover filtered languages, excluded Chinese aliases, explicit scripts, Greek variant
fallback and Tigrinya regional overrides. Every source/companion AX comparison remains exact. The independent
original-browser oracle covers all 930 CLDR/ICU/alias/default cases, including the expanded ar-XB failure; the formatter
never reads those AX results. Rebuild the compact tables from pinned ICU sources/filter/build and CLDR with
scripts/update_mermaid_quotes.ts. Final combined-source verification passes both compiler/font hosts, 85 actual/94
direct AX cases, 340 disposed Markdown/340 flex semantic snapshots per host, 222 focused/API tests and all 53 health
gates (3,949 root/42 steps, 558 Exomux, 63 web, 54 workers). All 1,379 input hashes match; current desktop-Chromium
evidence does not establish other browser/mobile profiles, external contexts or full-standard scope. The direct Chinese
fixture also pins generic-serif provenance: quoted source/owned measurement geometry must match exactly after
inheritance, without widening source-style/Range tolerances. Preserve the initial refused-layout receipt.

**Generated textual alternatives.** Twelve authored actual/direct fixtures distinguish native visual strings from
literal semantic slash alternatives, including empty decoration/visual strings, resolved attributes/lists, casing,
whitespace, styled HTML, MathML rows, hidden content and inert markup. One additional direct fixture compares an
alternative-bearing local ARIA name. Independent original/companion CDP trees must match, not be normalized. Private
instance-copy/author-attribute impersonation, combined per-box quota and aggregate alternative quota add three owned
cleanup/recovery guards. Three pure tests guard decoding/inertness/control/combined quotas and finite sub-layout-unit
used width/height/origin rounding; all other style changes remain exact. The reproduced MathML width-roundtrip case must
pass without removing the source fixture or relaxing independent Range/element geometry. Full combined-source
verification is in progress; counter/image alternatives and other full-standard requirements remain open.

**Generated Mermaid label text.** Three pure decoder tests cover resolved string lists, CSS escaping/Unicode, inert
markup, unsupported functions/URLs/alternatives and source/output/control limits. Eleven authored actual-engine/direct
fixtures cover HTML/MathML literals/attributes, casing, independent styles, wrapping, preserved spaces, hidden and
escaped text. Original source/companion AX, native colors/bold/italic/rows, JSON/disposed transport, independent
metadata capture, backward selection/focus, reentrancy, callback failure, quotas and rollback pass fifteen guard checks.
Higher-priority probe-only URL rules must cause no resource request, and failed suppression or :has()-driven source
layout changes must be diagnosed without leaving DOM/styles behind. These safety checks pass with no probe-only URL
requests; no full-standard gate is established by these checks. Chromium MathML anonymous generated rows must be
measured, not assumed inline merely from display:inline; source Range/element geometry independently confirms that
current-host behavior. A fourth pure test checks two exact source AX discrepancies independently: German uppercase in
MathML pseudos and preformatted generated spaces. Correct companion text is required; no arbitrary difference/whitespace
normalization is accepted. Container-only stylesheet probes verify exact text/attributes/entities/operators, inert
markup, unchanged upstream sanitization and a text quota; all three guards pass. Final verification includes the late
attribute-preserving stylesheet serialization: 178 focused tests, 55 actual/63 direct AX comparisons with four
explicitly checked source discrepancies, 220 disposed Markdown/220 flex semantic snapshots per compiler, both complete
catalogue/font hosts and all 53 health gates (3,918 root/41 steps, 558 exomux, 63 web, 54 worker). All 111 frozen
source/config/test/budget/API hashes match. Counters, quote keywords, alternative content, generated images/box effects
and broader full-standard work remain unfinished; an actual-engine audit reproduces the first three gaps with explicit
diagnostics.

**Mixed MathML content.** Two pure tests guard ordered escaped DOM strings, immutable JSON, text-only metadata rejection
and per-node/aggregate/node-count/control limits. Thirteen actual Mermaid cases and thirteen direct SVG cases cover
mixed mtext/mi/mn/mo/ms, automatic identifier styling, nested casing, token whitespace/NBSP and default/ legacy/authored
quotes. Browser CDP compares exact source/companion AX trees independently; direct fixtures also check true DOM text
nodes and native quote counts. Both compilers retain these scenes through disposed Markdown/flex reflow. Two extra
capture quota probes must preserve borrowed DOM, dispose measuring frames and recover. These checks do not establish
CSS-generated quotes, all MathML typography, other browsers/AT or full-standard acceptance.

Current mixed-content frozen receipt: 174 focused tests, 44 actual/52 direct AX trees, 176 disposed Markdown/flex
snapshots each per compiler, both complete catalogue/font hosts, 1,036 every-row snapshots/12,328 compared rows and
forty 120-column native viewer rows pass. Full health with `env -u NO_COLOR FORCE_COLOR=1 deno task health` passes all
53 gates (3,914 root/41 steps, 558 exomux, 63 web, 54 worker). Without that environment, five existing crayon colour
assertions fail; all nineteen tests in those three files pass under the corrected setting without assertion changes.
Source hashes remain unchanged. The next generated-text audit exposes a distinct missing ::before/::after/attr()
capability; it is not covered by the token-order/string fix.

**Browser presenter resizing.** `deno task web:resize:check` bundles the actual shared presenter into an isolated
loopback page and drives sixteen width/height growth/shrink frames at DPR 1/2. It compares 94,268 exact cells and 94,268
actual Canvas2D background pixels. Existing rows must track current width, not only newly created rows. The consumer's
`test:resize`, also included in `test:browser`, checks eight full-desktop frames/47,134 populated cells, every retained
row bound and right-edge chrome. It fails the original preview at cell 88,0 after width growth and passes the rebuilt
fixed source. Document-only cell checks did not cover this newly exposed desktop area.

**Bounded circuit visual layout.** Four regression tests cover optional-only chains in all directions and responsive
widths, direct consumer-aligned support rails, shared core axes, captions that cannot erase other connections, nearby
horizontal captions and wrapped independent-service rows. Combined document/flex/mounted-scroll selection passes 31
tests. The real tech-stack consumer also validates each authored chart's node/edge/style counts and desktop height, with
all 229 source/presented-cell scrolling samples passing after the rebuilt preview. Human visual approval and GPU
fidelity remain separate from these checks.

**CSS-transformed Mermaid text.** Twenty-four raw SVG/HTML cases cover upper/lower/capitalize, German expansion,
Turkish/Greek/Lithuanian language/context, combining/emoji/CJK, nested styles, and measured wrapping. HTML innerText is
an independent casing oracle; native frames/JSON must retain the displayed glyphs. Six
source/output/slice/interval/language/ depth refusal cases require cleanup, unchanged application selection/focus and
recovery. Eight actual themeCSS examples exercise both upstream label modes; browser/headless drivers retain these
through 128 disposed Markdown/flex snapshots per host. Combined-source broad checks now pass, including 169 focused
tests and all 53 health gates on 98 unchanged source hashes for the preceding visual-casing revision. Semantic casing
now receives exact string assertions in all 24 raw/eight actual examples. Thirty-one actual semantic examples and 39
direct SVG cases compare source/native companion nested AX trees without stripping text whitespace; eleven direct cases
also compare actual root name/description. Literal metadata, multiline descriptions, visible/display-hidden/visibility-
hidden/ARIA-hidden references, hidden descendants, named references, language, links, marks and explicit/default MathML
casing are distinct cases. Three new semantic casing/reference quota probes require cleanup and recovery, and three pure
tests verify owned-enum/JSON security and independent metadata/named-generic oracles. Current frozen selection passes
172 tests/87-file lint/three types, both font hosts and 1,036 every-row mounted scroll snapshots. Both final compiler
catalogues finish zero (39 examples/all 37 IDs), and health passes all 53 gates (3,908 root/41 steps, 558 exomux, 63
web, 54 worker). This is not full shaping, pseudo-element/decoration/bidi/AT/other-browser coverage.

**Measured SVG text.** Six pure regressions cover rotated direction, Unicode grapheme offsets, automatic/explicit
density, cross-style-run collisions, whole-wide-glyph clipping, actions, JSON and bounded malformed transport. Raw
owning-browser fixtures compare twenty rotations/reflections/skews/vertical/path/RTL/position/spacing/style/whitespace
cases against independent Range rectangles; 114 centers/105 native glyphs currently pass. Ordinary nested line
positioning must remain compact, not falsely trigger per-glyph spacing. Character/grapheme refusal requires unchanged
borrowed markup and later recovery. Real upstream vertical/horizontal/Unicode XY axes must retain native letters and
bounded dimensions, then render after compiler disposal through Markdown/flex wheel/width changes. Upright terminal
glyph placement is not rotated font outlines, complete shaping/bidi, all whitespace modes, other-browser/AT coverage or
maintainer review.

**Host-space strokes and ordered shape paint.** Five pure regressions distinguish host/local dash distances, wide/thin
projection, contour resets, malformed/bounded JSON metrics, shorthand normalization and ordered/split opacity paint.
Fifty-six additional independent decoded-Chromium fixtures compare stable colored interiors for transformed/root/
nested/percentage/calibrated/curved/arc/non-scaling paths and all shape/marker paint permutations. Separate probes
compare 42 numeric animation samples on split items, restore borrowed markup/keyframes, refuse source/marker limits and
recover without temporary DOM. Six real styled Mermaid examples per host retain both metadata and native cells after
JSON and compiler disposal, with 96 Markdown/flex scroll/reflow snapshots. Chromium's non-scaling strokeWidth marker
RMS-CTM normalization is measured, not assumed uniform or called universal SVG2 behavior. Text-outline paint order,
exhaustive curve/advanced stroke/animation, cross-browser/AT/consumer and real-terminal visual review remain open.

Zero-pathLength dash patterns remain finite/solid like current Chromium, including zero entries, three caps, signed
offsets and both stroke modes. A pure regression preserves unchanged pattern bounds even on that path. Additional
percentage/calc calibration measurements document the owning browser's differences from SVG2; this is not universal
infinite-calibration/percentage-rule compliance.

**Native stroke outlines.** Eight pure tests distinguish cap/join/miter-limit silhouettes, dash endpoints/phase/dots,
closed/disconnected contours, authored affine metrics, JSON portability, opacity union, clip/action transport,
zero-length thin marks and invalid/excessive work. Browser fixtures compare wide native occupancy with independent
isPointInStroke and stable decoded SVG RGBA, not implementation-generated outlines. Basic shapes, curves, transforms,
calibration, closed seams and zero-length path/line marks are included. Singular transforms have decoded-paint evidence,
not invented finite geometry-oracle values. Both real compiler hosts exercise styled wide/dashed edges and disposed
Markdown/flex reflow. Thin circuit glyphs retain a minimum footprint; full arcs/text-outline-paint-order/curve-outline
parity, sub-cell motion and real-terminal review remain open. Outline dash work has explicit rejection bounds, without
raising the existing frame/scene budgets.

**Mermaid structured accessibility.** Pure tests guard deeply immutable JSON label/MathML structure, element/
attribute/URL/control rejection, depth/cycle/node/text bounds, painted Markdown/flex transport and escaped MathML DOM
descriptors. Both engines add thirty-one actual diagrams, including eleven math cases, flow/class/Gantt actions and
three HTML whitespace cases. An independent Chromium CDP oracle compares nested upstream/native semantic parent-child
trees with whitespace preserved. Adjacent StaticText fragments merge only under the same semantic parent. Thirty-nine
direct SVG cases cover named groups, role fallback, symbol/use references, hidden visibility overrides, presentational
roots and normal/preformatted whitespace and styled text/reference/MathML casing. Explicitly opted-out definitions
remain hidden; unhidden definitions retain measured Chromium exposure. Pure regressions distinguish equal-preorder trees
with different parents and preserve leading/non-breaking spaces. Reference cycle/external/node-bound/recovery probes
require unchanged borrowed DOM and owned cleanup. Direct DOM events verify explicit host actions versus inert defaults,
unchanged borrowed DOM, source/disposal/offscreen refusal, retained reflow focus and modifier routing, no global
callback execution, CSS/ARIA hidden/definition exposure and three raw/aggregate quota failures. All-family root
transport also checks structured content. This is not every SVG semantic construct, every family feature, other
AT/browser coverage, consumer integration or human review.

**Mermaid root accessibility.** Six pure/controller tests guard immutable bounded metadata, terminal controls,
graphics/fallback/description projections, clipped row identity, source/visibility/disposal and solved flex scopes. A
stable-API regression preserves nodes.map(toAriaAttributes), Parameters/ReturnType and bind/call/apply through the
unchanged single-argument signature. An additive toAriaAttributesWithDescription helper binds owned descriptions. Both
actual engines exercise all 39 family preambles, nine unchanged native-visual baselines, multiline/SVG-only metadata and
five invalid/recovery cases. Forty JSON scenes receive 160 Markdown and 160 flex wheel/resize snapshots per host after
compiler disposal. Browser fixtures reject nested/foreign names and reference-count overflow, preserve borrowed
children, keep metadata inert, clear stale semantics on source/failure and retry without rebuilding unchanged nodes. An
external CDP Accessibility.getFullAXTree oracle reads actual name/description/graphics role/role-description, not just
attribute strings. This is root metadata evidence; full structured label/math/action semantics, consumer wiring, other
AT/browser coverage and human review remain open.

**Hand-drawn geometry and flow features.** Six curve tests guard control-hull error, loops/reversal, reflected/relative
commands, partial-length transport and source/point/subdivision work. Four stroke tests guard subpixel cell/interval
traversal against independent segment-box intersections, missing dashed cells, direction glyphs and invalid work. One
registry test compares all 53 shapes/87 aliases against the installed pinned release's literal declaration. Browser and
private hosts add 159 canonical-shape/look cases, 87 classic aliases and 66 theme/look/HTML-label combinations; invalid
shape/grammar cases must reject and recover. Each host renders 119 retained JSON diagrams after compiler disposal in
Markdown/flex with four widths/two wheel positions (1,904 snapshots). Independent Chromium compares 194 curve-distance
vertices, 153 painted centerline cells and 94 empty dash-gap cells; 400 almost-straight contours retain 800 points, and
failed curve limits leave source DOM unchanged. A native 120x40 frame retains captions and tangent hatches.
Centerline/glyph evidence is not proof of full stroke-width/cap/join outlines or maintainer visual review.

**Portable Mermaid animation.** Nine pure/mounted tests verify timing, CSS cubic/step easing, exact duplicate-keyframe
boundaries, JSON/pause, immutable paint/group projection, work rejection, transparent hit removal, transactional bad
clock recovery and borrowed Markdown/flex clock disposal. Six pinned official edge-animation examples have eleven native
phases in both hosts. Retained JSON scenes mount after compiler disposal; four viewport widths/six phases/two hosts
require stable row bounds and no compile jobs/generation changes on ticks. An independent mounted Chromium oracle
compares 26 timing configurations/468 samples with computed stroke paint, including zero/fractional counts, negative
delay/end delay, fill/directions, per-frame easing and exact discontinuities. It checks source/keyframe restoration,
paused effects, opacity, failure cleanup and diagnostics for unsupported geometry/coupled stacks. Four native 120x40
frames preserve labels and vary paint after disposal. Static/numerical cell evidence does not prove shader, true-color,
motion preference or maintainer visual review; full advanced animation remains task 050 work.

**Native document interaction UI.** Ten pure/mounted tests drive actual component Tui delivery and offscreen Markdown/
flex host keys. They require wrapped/styled links to remain one stop while equal links/fence/panel node IDs remain
distinct; viewport-safe, inert grapheme-aware tooltip bounds/truncation; wide-cell edge repair; popup click-through
blocking; preserved Tab/modifier routing; offscreen/clipped/source-replaced action refusal; borrowed view-local focus;
opt-out presentation, failed-adapter subscription/microtask cleanup and transactional render-cache failure/retry. Actual
engine flow/class/Gantt fixtures add keyboard activation and tooltip snapshots in both browser and private Deno hosts,
including scenes retained after compiler disposal. These do not establish every family's interactions, animated hit
geometry, assistive technology or maintainer visual review.

**Full Mermaid conformance.** Task 050 is not established by the old flowchart tests. The optional engine has model
tests for per-window configuration serialization, cancellation/failure recovery and DOM capability diagnostics; native
conversion tests cover styled vector/text cells and winding contours. Prepared Markdown tests cover unique-fence
compilation, native mounting/styles/links, invalidation, wide-character clipping, cancellation and terminal-control
safety. `deno task mermaid:test:browser` exercises release-pinned examples for every registered upstream diagram ID and
fails on an uncovered ID. It also verifies twenty-one DOM scene regressions, prepared native rows for every family and
mounted scroll/reflow sequences for five examples. Zero-array/distance/phase regressions verify solid arrow portions,
odd-array repetition, transforms, pathLength calibration and per-contour resets against Chromium's isPointInStroke().
Zero-length dashes paint only with round/square caps; default butt caps are invisible. Pure distance tests bound tiny
patterns. Geometric clips pass 1,581 cell-interior comparisons against decoded Chromium SVG paint, covering holes, child
unions, ancestor intersections, local/box coordinates, curved/empty/zero-area clips, CSS path data and
rotated/percentage SVG viewports. Scene extraction must leave mounted DOM markup unchanged. Pure tests guard winding
trees, clipped paint/link targets, whole wide glyphs, cycles/depth/point limits, exact linear vertices and explicitly
capped sample caches. Paint fixtures compare 34,712 RGBA cell samples with independently decoded Chromium SVGs,
including overlapping/nested group opacity, all 16 CSS blend modes and local gradient
coordinates/transforms/templates/spreads, hard/transparent stops and modern color spaces, CSS/SVG filter chains, named
results, blur/shadows, primitive regions and post-filter clipping, plus use inheritance/currentColor, scoped selectors,
nested shapes/groups/text, percentage positions/transforms, links, paint order and symbol/SVG viewport sizing/clipping.
DOM budget probes reject excessive stop/filter definitions and references, use nodes/instances/depth, without leaking
temporary probes. Image probes cover byte/source/raster bounds, timeout/cancellation and owned capability/DOM cleanup.
Three image fixtures add 8,632 stable-interior RGBA comparisons plus HTML object-fit and mixed SVG/HTML asset selection;
image edge resampling/antialiasing is not claimed pixel-exact. Nine pure image tests cover PNG/JPEG preflight, base64
transport, premultiplied sampling, transparency/links, opacity/occlusion/clipping, affine placement and decode/work
bounds. Reference fixtures also reject cycles/external URLs and suppress uninstanced symbols. Nine pure paint tests
cover alpha/backdrops, group order, gradient sampling/degeneracy, blend math, wide-glyph occlusion and invalid/excessive
composite allocations. A prepared Markdown regression guards host-backdrop flattening and the diagnosed black default.
Thirteen pure filter tests cover color spaces, all CSS photometric functions, group ordering, fractional offsets,
Gaussian energy, SourceGraphic/SourceAlpha, unlinked halos, channel transfer and Porter-Duff rules, post-filter clips,
identity colors and graph/kernel/allocation validation. Off-frame source buffering, animation and unsupported filter
primitives retain explicit diagnostics. `deno task mermaid:test:headless` repeats all 39 examples/all 37 IDs through the
actual Deno-side compiler and native surfaces (156 consecutive viewport snapshots). It asserts unchanged application
globals. Six actual-engine image checks cover documented PNG/JPEG/SVG nodes, cached repeated approved resources, denial,
oversized PNG headers and recovery; three image scenes retain decoded colors after JSON transport and compiler disposal.
Browser-backed transport fixtures separately test option/source bounds, isolated globals, failure recovery, queue
pressure, queued/active cancellation, timeout recovery, startup/disposal cleanup, deny-by-default resources, policy
exceptions and per-hop redirect approval. Streaming tests verify decoded gzip bodies/headers, single and aggregate
quotas, request/concurrency bounds and server-observed reader cancellation. Browser integration repeats actual download
abort/timeout/disposal and recovery, and capability snapshots. They do not substitute for real grammar evidence. The
headless host requires installed Chromium; the conformance task explicitly disables the sandbox only for this known test
environment. Compiler sandboxing defaults on. Compiled-host checks must verify missing-capability refusal and explicit
prebuilt-engine execution rather than allowing a recursive Deno.execPath self-spawn. This catalogue is not complete
feature or visual verification: complete advanced stroke/text-outline paint, advanced images/animation, complete
vector/embedded pre-decode guarantees and font readiness/memory, advanced CSS/text/use clips/masks/filters,
syntax/security, full async document lifecycle, cross-process interactions, published-install execution and maintainer
review remain gates.

**Native MathML feature evidence.** Nine real upstream math fixtures cover flowchart/sequence labels, scripts/limits,
fractions/nesting, radicals/indices, matrices/fences, overbars/vector accents, binomials and hidden phantom text.
Browser and Deno hosts each check 36 immediate native Markdown scroll/resize snapshots; nine JSON scenes render after
compiler disposal. A direct DOM fixture preserves color/emphasis/group opacity/links while excluding annotations and
phantoms. Direct baseline extraction and node/layout-work rejection must leave source markup unchanged. Invalid KaTeX
rejection and recovery remain upstream-owned; legacy HTML mode must report its unfinished native capability. Four pure
tests guard portable density, stretched assemblies/directions, clipping/style/link transport and invalid/oversized
metadata. These are structural glyph/row checks, not pixel-level MathML font outlines or proof of every KaTeX feature.

**Host icon feature evidence.** Ten real-engine fixtures cover bare/square/circle/rounded icon nodes, top/bottom labels,
aliases/rotations/flips, explicit host-permitted local use, registered FontAwesome label vectors, Architecture
custom/default icons and TreeView explicit/default/filename/extension maps and suppression. Browser probes compare
stable colored interiors against independently decoded upstream SVGs, and both hosts perform four immediate native
Markdown scroll/resize snapshots per fixture. Separate actual-engine probes require true lazy loading, shared browser
registry semantics, sticky cache precedence, observable failure/placeholders, retry, signal/timeout cleanup and private
headless page recovery with effective-cache restoration. Eleven JSON icon scenes paint after compiler disposal. Direct
inline SVG text must appear once rather than also being walked as HTML. Six pure registry/density tests cover snapshots,
alias transport, request coalescing, late-result cancellation, quotas, cache replacement and invalid/detail frame
bounds; an eighth browser-backed transport test isolates headless capability bridging without claiming grammar coverage.
Retained snapshot bounds do not bound a custom host loader's own acquisition. CSS icon fonts and complete advanced SVG
feature parity remain open, and the local use fixture explicitly supplies upstream sanitation capabilities.

**Pure model tests.** Every controller, layout function, reducer, and resolver is testable without a terminal, a mount,
or a frame. These are the bulk of the suite and they run in milliseconds. If a piece of logic needs a rendered frame to
test, that is a signal it is in the wrong place — extract the model.

**Native Mermaid marker evidence.** Two independent Chromium SVG-paint fixtures check authored mid vertices, analytic
curve tangents/shorthands/arcs, disconnected/closed paths, nested/circular definitions, source styles/context gradients,
clipping, scaling, opacity and empty/zero-width viewports. Colored-interior thresholds prevent background-only success.
Single-moveto, zero-vector, half-turn and percentage lengths match the current owning browser, not universal SVG2
equivalence. JSON scenes paint identically after compiler disposal; direct extraction leaves source markup unchanged.
Five budget probes reject per-definition/aggregate nodes, instances, style units and depth while leaving no temporary
DOM. Seven pure tests guard command vertices, tangents, edge angles and parser bounds. Other basic-shape equivalents,
advanced marker text/nested-use context paint and full stroke/paint-order/animation fidelity remain open.

**Mermaid font readiness.** `deno task mermaid:test:fonts` uses the existing pinned KaTeX WOFF2 in private
loopback/browser hosts. Ten actual-browser cases block font bodies while compilation is observed, then compare complete
loaded geometry, labels and paint against a fresh stable compile (normalizing only generated paint-server IDs). Active
and first-use loads, SVG-only output, abort/timeout/disposal, registration snapshots/ownership, invalid decode and
observation/relayout bounds must leave no measuring DOM or revoked borrowed fonts. Actual Deno compilation matches
browser geometry, isolates another compiler, restores registrations after live icon/page cancellation and paints
transported scenes after disposal. Pure tests guard retained-byte/count/config snapshots, timeout/abort waiter cleanup,
identity/status changes and independent compiler disposal. This is not full font-outline/configuration coverage,
decoded-font/shaping memory proof or browser-internal decoder cancellation.

**Async Mermaid document lifecycle.** Ten cache/API/controller/mounted tests require immutable configuration/result
snapshots, theme/width/trust cache separation, shared leases without cross-window cancellation, last-result suppression,
LRU/byte/job/timeout bounds, invalidation/disposal/retry, reactive source/theme/width updates, native links/styles and
scroll/title preservation. A transparent-paint fixture checks actual backdrop reprojection with no extra compilation;
last-lease cancellation must release its queue slot and refuse late retention. Unicode/control-safe error cells must not
downgrade invalid grammar to source text. The same real-engine two-window fixture runs in browser and headless
conformance, checking one equal-request compilation, upstream theme/native color isolation, actual measuring-width
transport, error/source recovery, host invalidation and ten mounted snapshots. Real live lazy-icon jobs verify that
closing one window preserves a shared loader while last-lease cancellation aborts it and the actual compiler recovers.
An immediate first viewport before subscription readiness must preserve every row, including the opening title. This is
static-scene refresh evidence, not animation timing, font/asset readiness or cross-process interaction parity.

**Full-Mermaid flex lifecycle.** Five model/API tests verify solved content-width compilation without one-column mounts,
single-model measurement/painting, shared leases, reactive source/settings, same-width remeasurement, visible-panel
anchors, mounted cell/link coordinates, structural changes during pending work and removed-panel
cancellation/late-result suppression. Generic flex tests guard borrowed models/signals, immutable structure,
first-title-role replacement, retained IDs, duplicate validation and failed-factory cleanup. Immediate source updates
before Computed readiness must reach the document. Wide/combined canvas glyphs retain continuation cells; clipped final
wide glyphs disappear whole. Mounted oracle padding uses terminal columns, not UTF-16 padEnd, which previously asserted
wide-label corruption. Both actual compiler hosts compile all 39 examples/all 37 IDs together in flex cards at
120/48/160 columns, with 241 native content snapshots each, real theme/source/error recovery, anchors and final panel
cleanup. These do not establish every syntax/ configuration's responsiveness, animated timing, complete font/asset
readiness, full interaction parity or human review.

**Component and layout tests.** A layout function is given a rect and asserted on the rects it returns: rows stay inside
the box, buttons do not overlap the text, a narrow window stacks instead of truncating. Deterministic, no rendering.

**Mounted application tests.** `mod.testing.ts` provides a headless terminal app with a `pilot` that clicks, types, and
scrolls, and a frame buffer that can be read back cell by cell. This is the level that catches what inspection cannot:
an event swallowed before its handler, a frame memoised on a signature that omits the thing that changed. Both of those
shipped and were caught here.

**Golden fixtures.** Where behaviour is a whole-surface property rather than a single assertion, the surface is
captured: `packages/exomux/tests/fixtures/hit_map/` holds an ASCII map of which target owns every cell of the desktop,
so a refactor of the pointer stack is a diff rather than an argument.

**Protocol and skew tests.** The exomux daemon is versioned against clients that may be newer or older. Tests cover both
directions: an unknown message from an authenticated client is refused without dropping the session, a descriptor
carrying unknown fields still loads, and a capability the host never advertised is never exercised.

**Contract tests.** Where an API's meaning is easy to misread, a test pins the meaning rather than the behaviour —
`tests/tui_destroy_contract.test.ts` exists because `destroy()` not emitting `destroy` cost a black screen.

**Native interaction evidence.** Six model/mounted tests guard executable/control-bearing URLs, semantic callback
capture against fresh versus singleton databases, quoted/default arguments, metadata limits and exact descriptor
cleanup, rich-versus-legacy dispatch, hover scroll/hide/input-ownership/move/disposal, wide-glyph clipping and paint
occlusion. Both actual engines exercise flowchart/class/Gantt in strict/default/classic configurations, with native
clicks/hover, targets/tooltips, Markdown/flex whole-card precedence and 24 scroll/pan/reflow snapshots per host.
Negative probes reject source policy escalation, unsafe native URLs and excessive real callback metadata, then require
recovery. JSON scenes must still activate native host hooks after compiler disposal. Independent browser DOM probes
verify inert tooltip-to-text conversion, field/aggregate/ancestor budgets and unchanged source markup. Headless page
exceptions are serialized errors, so browser error prototypes are not a transport contract. These checks do not
establish built-in tooltip presentation, keyboard action navigation, all-family interactions, animated hit regions or
human review.

## Running it

```sh
deno test -A                      # root suite (~3,460 tests, ~3 min)
deno test -A --filter "<name>"    # one test
cd packages/exomux && deno test -A # exomux suite (~510 tests, ~2 min)
deno task health                  # the full gate list, as CI runs it
npm test --prefix packages/exomux-npm # npm binary installer and launcher (Node.js 22+)
```

Before committing anything that touches modules or public API:

```sh
deno fmt
deno run -A scripts/update_entrypoint_budgets.ts     # export budgets per entrypoint
deno run -A scripts/update_public_api_baseline.ts    # the recorded stable surface
```

Both regenerate a checked-in baseline. A diff in either is the point: it makes an API change visible in review instead
of silent.

## Gates

`deno task health` runs formatting, type checks on every entrypoint and example, a reachability check that no source
module is imported by nothing, the API reference check, package and release checks, and the web build. CI runs `health`
plus a clean release-candidate verification. A green suite with a red gate is not done.

The npm launcher has a separate Node 22/24 CI matrix on Linux, macOS, and Windows. Release CI additionally packs the
actual application, runs it via npm with install scripts disabled and through a global installation on every binary
platform, then publishes the tested tarball. See [npm release instructions](../../docs/exomux-npm-release.md).

## What is not covered automatically

State these rather than pretending otherwise:

- **GPU rendering fidelity.** The butterchurn GPU path is validated by a fixture rotation and a CPU-vs-GPU comparison,
  but strict-driver failures reproduce only on the maintainer's Intel laptop, not in the sandbox. Debug logs from the
  real machine are the evidence.
- **Live terminal behaviour.** Animations, shaders, and true-colour output are disabled or unobservable in headless
  mounts. They need a human looking at a real terminal, and a task is not complete until that check happens.
- **The live daemon.** Never drive the maintainer's running exomux from a test or a script: it attaches to real PTYs and
  a real tmux. Use an isolated state root (`XDG_STATE_HOME`) and a private tmux socket. Read-only probes — listing
  sessions, a brief attach and detach — are safe and have been used to verify fixes against the real thing.

## Acceptance

A task is complete when its own acceptance checks pass, both suites pass, the gates pass, and — for anything that
changes what a person sees — the maintainer has looked at it running.
