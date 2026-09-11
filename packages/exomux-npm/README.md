# Exomux

A terminal multiplexer and desktop with floating windows, detachable sessions, themes, and animated backgrounds.

```sh
npx @ubernaut/exomux
```

Or install the command permanently:

```sh
npm install -g @ubernaut/exomux
exomux
```

Requires Node.js 22 or newer. No Deno installation is needed. Supports Linux x64 (glibc), macOS Apple Silicon and Intel,
and Windows x64. On macOS, sessions currently end when the client exits because the daemon cannot detach.

The installer downloads your platform's standalone executable from the matching
[GitHub release](https://github.com/ubernaut/exotui/releases) and verifies its SHA-256 checksum. GitHub must be
reachable on the first install. If your package manager skips install scripts, the first `exomux` invocation downloads
it instead. Subsequent launches reuse the verified executable without a network request.

Binaries live in the user's cache directory under `exomux/npm`, independently of npm's temporary package directories.
Set `EXOMUX_CACHE_DIR` to change that location. Keep it on a filesystem that allows executable files.

`exomux --help` lists the options; inside exomux, `Ctrl-N ?` lists the keyboard commands.

See the [project README](https://github.com/ubernaut/exotui#exomux-quick-start) for the Deno, Nix, and source-install
alternatives. This npm package provides the CLI; application developers can import the
[JSR package](https://jsr.io/@ubernaut/exomux).
