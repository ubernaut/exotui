# Detailed development log: `bug/exomux-npm-macos-test`

- **Branch:** `bug/exomux-npm-macos-test`
- **Started:** 2026-09-12

## First npm publication

The user authorized pushing the existing npm support, running the release pipeline, and publishing the first npm
package. Pushed `main` at `98cd11a9`, then tagged that tested source as `v0.7.2-npm.1` for the initial npm distribution
of exomux 0.3.1. The mouse-selection feature remains on its separate branch. npm browser login authenticated `ubernaut`.

Release run `34730101069` builds and smoke-tests all four native binaries, packs the exact release, and tests npm exec
and global installation on Linux, macOS arm64/x64, and Windows. Initial publication uses the authenticated local npm
client with the workflow's tested tarball, since GitHub has no bootstrap publishing token.

The separate launcher matrix run `34730089138` passed on Linux/Windows and failed only the cwd assertion on both macOS
Node versions. Actual cwd was `/private/var/...`; the expected temporary path was `/var/...`, its symlink alias. The
launcher preserved the directory correctly. Compare against `realpath(fixture.root)` while retaining the exact argv,
stdin, stdout, stderr, environment, exit-code, and signal assertions. This changes a test excluded from the npm tarball,
so the release binaries and staged runtime package remain the same.

All four release builds, the npm package job, and all four npm installation smoke jobs passed. GitHub publication
stopped with ENEEDAUTH. Local publication of that exact artifact then stopped with npm E403 because the newly created
account has 2FA disabled. The user has been asked to enable it; public-registry installation and trusted publishing
remain pending. The release guide now documents this prerequisite and the npm trust command for later OIDC setup.

The 14 launcher tests passed locally. The initial full health run passed every check except formatting: 3,683 root, 552
exomux, 62 web, and 54 worker tests passed. Formatting was corrected with the explicit root deno.jsonc config; the full
repository format check then passed. A fresh complete health run passed with exit 0. Use
`env -u NO_COLOR deno task health` because the shell's forced NO_COLOR setting conflicts with existing color tests.

Runtime artifacts, authentication state, and downloaded binaries stay outside the repository. The exact tested tarball
is `/tmp/exomux-first-npm-artifact/ubernaut-exomux-0.3.1.tgz`; its SHA-1 is `e33584eb68dfaa8584f9b380272f7e8790ea4f60`.
Retry publication of that artifact after account 2FA is enabled, then configure GitHub OIDC and verify public npx/global
installation. Retry only the failed release job, preserving immutable assets.

## Publication completed

The user enabled account 2FA and completed npm's browser challenge. Publication succeeded for `@ubernaut/exomux@0.3.1`;
the public registry's version endpoint returns matching SHA-1 and SHA-512 hashes for the workflow's exact artifact. The
package listing initially continued to return 404 while the version endpoint returned 200, so fresh npm/npx installation
checks wait for registry propagation.

Configured GitHub trusted publishing with npm trust after a second browser challenge: repository `ubernaut/exotui`,
workflow `exomux-release.yml`, no environment. npm confirmed creation. No GitHub token secret was needed. A subsequent
trust-list query also required 2FA; the successful creation response is the configuration evidence. Future publication
through OIDC will be exercised on the next new package version.

Removed the first-release caveat from both install READMEs. Final health and registry smoke results are recorded in the
integration commit and ICC task evidence; authentication state and temporary verification logs remain outside Git.

The public package listing propagated and the fresh public `npx @ubernaut/exomux --help` check passed. Retrying only the
failed publish job made release run `34730101069` green; it detected the existing version and preserved it. A user
interruption stopped the subsequent final health run and additional install checks, so those checks were restarted.
