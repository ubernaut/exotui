# Releasing exomux on npm

The npm name is `@ubernaut/exomux`; its command is `exomux`. The package is a Node.js 22+ launcher for the standalone
executable, not a Node port of the Deno application. The source template lives in `packages/exomux-npm` and is private
to prevent accidentally publishing it without release metadata.

## First publication

The npm route is implemented but is not available until the first package publication succeeds.

The release workflow prefers [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). For the first
publication, when the package does not yet exist, an npm account with permission to publish under `@ubernaut` must
either publish the tested workflow tarball interactively, or supply a narrowly scoped publishing token as the GitHub
Actions secret `NPM_TOKEN`. Tokens that require interactive 2FA cannot publish unattended.

After the package exists, configure its trusted publisher on npmjs.com with GitHub user `ubernaut`, repository `exotui`,
and workflow filename `exomux-release.yml` (no environment). Subsequent publishes use GitHub OIDC; remove the bootstrap
token when this works. Node 24 on the publish runner includes a compatible npm version. Never put tokens in the
repository.

## Release flow

1. Update `packages/exomux/deno.json` to a new exomux version. npm uses that version, independently of exotui's version.
   Changes to the npm launcher also require a new exomux package version.
2. Run `npm test --prefix packages/exomux-npm` and `deno task health`, then integrate the tested change into `main`.
3. Tag the release commit with the normal `vX.Y.Z` release tag, or dispatch `exomux-release.yml` with an existing tag
   that contains the npm packaging code. Every checkout uses the requested tag, including manual dispatches.
4. The workflow compiles and smoke-tests Linux x64, macOS arm64/x64, and Windows x64 binaries and attaches them to that
   release. The Intel macOS build uses `macos-15-intel`; the retired `macos-13` runner cannot build releases.
5. After all builds succeed, it stages a package with the exomux version, the exact GitHub release tag, and SHA-256
   checksums and sizes for all four assets. It packs one tarball, then tests both `npm exec` with scripts disabled and
   global installation on each platform, against the uploaded release binaries.
6. Only after those checks pass does it publish that same tarball publicly. The `exomux-npm` workflow artifact is also
   available for inspection or a first interactive publication with `npm publish <tarball> --access public`.

Release assets must remain immutable: published npm versions pin their checksums and never use `releases/latest`. The
upload step refuses to overwrite an existing asset. Retry only failed jobs after a partial failure; do not rebuild
successful assets. For changes to a shipped binary, use a new exomux version and a new release tag. If the npm version
already exists, the publish job leaves it unchanged; a library-only release does not republish exomux. Registry errors
other than a missing version fail the job.

## Local packaging check

Download the four binaries from the exact release into a temporary directory, then stage outside the repository:

```sh
# Replace the tag with the release being tested.
gh release download vX.Y.Z --repo ubernaut/exotui --pattern 'exomux-*' --dir /tmp/exomux-binaries
node scripts/prepare_exomux_npm.mjs vX.Y.Z /tmp/exomux-binaries /tmp/exomux-npm-stage
npm pack /tmp/exomux-npm-stage --pack-destination /tmp
```

Use a fresh output directory. Run preparation from the release's checkout so the exomux version describes those
binaries. The script requires all four assets and embeds their hashes; it does not infer an exomux version from the
library's tag. `prepack` validates the metadata before creating a publishable archive.

Test the resulting tarball with `npm exec --yes --ignore-scripts --package=<tarball> -- exomux --help` and
`npm install --global --prefix <temporary-prefix> <tarball>`. Set `EXOMUX_CACHE_DIR` and `XDG_STATE_HOME` to temporary
directories for these checks. `--help` exits before accessing a live daemon.
