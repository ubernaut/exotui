#!/usr/bin/env bash
# Compiles Exomux and installs it for the current user, so `exomux` works from
# any directory. Re-run after pulling changes to refresh the installed binary.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${EXOMUX_BIN_DIR:-$HOME/.local/bin}"

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno is required to build Exomux (https://deno.com)" >&2
  exit 1
fi

echo "Compiling Exomux..."
deno task --cwd "$repo/packages/exomux" compile

mkdir -p "$bin_dir"
install -m 755 "$repo/packages/exomux/exomux" "$bin_dir/exomux"
echo "Installed $bin_dir/exomux"

case ":$PATH:" in
  *":$bin_dir:"*)
    echo "Run it from anywhere with: exomux"
    ;;
  *)
    echo "note: $bin_dir is not on your PATH. Add it with:"
    echo "  export PATH=\"$bin_dir:\$PATH\""
    ;;
esac

# If Ghostty is installed and its config does not already load Exomux's shaders,
# offer to enable them (turns on a default CRT scanline effect). Exomux's own
# shader generation is reused, so nothing here duplicates the GLSL.
setup_ghostty_shaders() {
  command -v ghostty >/dev/null 2>&1 || return 0

  local xdg="${XDG_CONFIG_HOME:-$HOME/.config}"
  local managed="$xdg/exomux/shaders/ghostty.conf"
  local ghostty_config
  if [ "$(uname -s)" = "Darwin" ]; then
    ghostty_config="$HOME/Library/Application Support/com.mitchellh.ghostty/config"
  else
    ghostty_config="$xdg/ghostty/config"
  fi

  # Already wired up? Leave it alone.
  if [ -f "$ghostty_config" ] && grep -qF "$managed" "$ghostty_config" 2>/dev/null; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "note: Ghostty detected — enable interface shaders from Exomux Settings, or run this script in a terminal to set them up now."
    return 0
  fi

  printf "Ghostty detected. Enable Exomux CRT interface shaders now (adds an include to your Ghostty config)? [y/N] "
  local answer=""
  read -r answer || true
  case "$answer" in
    [yY] | [yY][eE][sS]) ;;
    *)
      echo "Skipped — you can enable shaders anytime from Exomux Settings (inside Ghostty)."
      return 0
      ;;
  esac

  if deno run --allow-read --allow-write --allow-env - "$repo" <<'DENO'
const [repo] = Deno.args;
const ghostty = await import(`file://${repo}/packages/exomux/ghostty.ts`);
const xdg = Deno.env.get("XDG_CONFIG_HOME") ?? `${Deno.env.get("HOME")}/.config`;
const configDir = `${xdg}/exomux`;
const base = ghostty.defaultExomuxShaderConfig();
const shaders = {
  effects: { ...base.effects, scanline: { enabled: true, params: base.effects.scanline.params } },
};
// Generate the GLSL, write the managed Ghostty config, and wire the include.
const result = await ghostty.applyExomuxShaders(configDir, shaders);
await ghostty.ensureExomuxGhosttyInclude(result.configPath);
// Persist to exomux.json (plain merge; Exomux normalizes on read) so Settings agree.
const configPath = `${configDir}/exomux.json`;
let json = {};
try {
  json = JSON.parse(await Deno.readTextFile(configPath));
} catch {
  // No config yet — start fresh.
}
json.shaders = shaders;
await Deno.mkdir(configDir, { recursive: true });
await Deno.writeTextFile(configPath, `${JSON.stringify(json, null, 2)}\n`);
DENO
  then
    echo "Enabled the CRT scanline shader. Reload Ghostty's config (or restart it) to see it; tune or add effects in Exomux Settings."
  else
    echo "warning: could not enable shaders automatically — enable them from Exomux Settings instead." >&2
  fi
}

setup_ghostty_shaders
