# Detailed development log: `bug/exomux-npm-windows-test`

- **Branch:** `bug/exomux-npm-windows-test`
- **Started:** 2026-09-12

## Windows cwd alias assertion

The first npm release is published and verified: public npx, scripts-disabled npm exec, and a global install with a
fresh binary download all passed. Both installation READMEs are updated on main. GitHub trusted publishing is
configured, and release run `34730101069` is green. The prior integration passed every health gate, including 3,683
root, 552 exomux, 62 web, and 54 worker tests.

Launcher CI run `34731448931` on main `505e3227` passed Node 22/24 on macOS and Linux but exposed a second alias issue
on Windows: the child reported `C:\Users\RUNNER~1\...` while realpath of the fixture resolved to
`C:\Users\runneradmin\...`. Resolving only the expected path fixed macOS but introduced this mismatch on Windows.

Resolve both actual and expected cwd through realpath before comparison. This preserves the exact directory assertion
and all argv/environment/stdin/stdout/stderr/exit/signal checks. The change is confined to a test excluded from the npm
archive; the release binaries and launcher remain unchanged. Final local health and native CI outcomes are recorded in
the integration commit and ICC task evidence.
