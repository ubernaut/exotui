# Detailed development log: `feature/markdown-table-wrap`

- **Branch:** `feature/markdown-table-wrap`
- **Started:** 2026-11-18, from `main` at `fca01c3e`

## 2026-11-18 — Complete table cells and word-wrapped plain headings

Need: the tech-stack consumer now renders a 62-page information packet with 27 prose-heavy tables. `renderTable` put
every row on one line and cut cells with an ellipsis, so most of that text could not be read at any width. Plain heading
fallback split words between glyphs on phone-width windows.

Change 1, `src/content/markdown.ts`: `MarkdownRenderOptions.tableCells?: "truncate" | "wrap"`. The default path is
untouched. In wrap mode each cell is wrapped with the existing `wrapInlines`, so strong/emphasis/code marks and link
targets survive and link hit-testing works through the ordinary segment geometry. Column widths: every column first gets
its longest word (capped at 24 cells), then spare cells go one at a time to the narrowest columns still short of their
content. Rules separate body rows only when some body row wraps, so single-row tables stay compact and identical to the
default output when they fit. When the longest words do not fit, or a column that still wraps falls below eight cells,
each body row becomes a record: the first cell as its title, later cells indented under their header labels. Quote
prefixes are kept in both forms.

Change 2, `src/content/heading_fonts.ts`: the plain branch of `renderAsciiHeading` wraps at spaces. A heading that fits
is returned unchanged, including its own spacing; a word wider than the row still splits between glyphs, and a glyph
wider than the row is still replaced.

History: both edits were first made uncommitted on `feature/document-renderers` in the maintainer's checkout while
working on the consumer. At the maintainer's direction they were moved to this branch from the latest `main`; that
checkout's four files were restored and its other uncommitted files were not touched.

Verification on this branch: `tests/markdown.test.ts`, `tests/document_renderers.test.ts`, `tests/flex_markdown.test.ts`
and `tests/markdown_surface_scroll.test.ts` (36 passed); `deno check mod.ts mod.document.ts`; `deno fmt --check` (1654
files); `deno lint` on the four files; `api-reference --check=docs/api-reference.md`; the `api-inventory` gate with the
stable baseline. The full `deno task health` run was not done. Consumer evidence is recorded in tech-stack's
`plan/todo/done/information-packet-root.md`. Not pushed, not merged.

Known neighbours, not changed here: a space inside link text is emitted without the link target, so a multi-word link
has unlinked gaps; default-mode cells flatten inline marks and links; `examples/web/ansi_cells.ts` keeps colour only, so
bold, italic and underline never reach desktop document windows.
