import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export const releaseBase = "https://github.com/ubernaut/exotui/releases/download";
export const assets = Object.freeze({
  "linux-x64": "exomux-linux-x86_64",
  "darwin-arm64": "exomux-macos-aarch64",
  "darwin-x64": "exomux-macos-x86_64",
  "win32-x64": "exomux-windows-x86_64.exe",
});

export function assetFor(platform = process.platform, arch = process.arch) {
  const asset = assets[`${platform}-${arch}`];
  if (!asset) {
    throw new Error(
      `No exomux binary for ${platform}/${arch}. Supported: Linux x64, macOS arm64/x64, Windows x64. ` +
        "Use the Deno/source installation: https://github.com/ubernaut/exotui#exomux-quick-start",
    );
  }
  return asset;
}

export function validateRelease(release, version) {
  if (
    release?.version !== version ||
    !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release?.tag)
  ) {
    throw new Error(
      "Invalid exomux release metadata; prepare the npm package from its release binaries before packing.",
    );
  }
  for (const asset of Object.values(assets)) {
    const entry = release.assets?.[asset];
    if (
      !/^[a-f0-9]{64}$/.test(entry?.sha256) ||
      !Number.isSafeInteger(entry?.size) || entry.size <= 0
    ) {
      throw new Error(
        `Missing or invalid checksum/size for ${asset}. All platform builds must succeed before packing.`,
      );
    }
  }
  return release;
}

export async function readRelease(root = packageRoot) {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    return validateRelease(
      JSON.parse(await readFile(join(root, "release.json"), "utf8")),
      pkg.version,
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Exomux release metadata is missing. Build the npm package with scripts/prepare_exomux_npm.mjs.",
      );
    }
    throw error;
  }
}

export function cacheDirectory() {
  if (process.env.EXOMUX_CACHE_DIR) return process.env.EXOMUX_CACHE_DIR;
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : process.env.XDG_CACHE_HOME ||
      (process.platform === "darwin" ? join(homedir(), "Library", "Caches") : join(homedir(), ".cache"));
  return join(base, "exomux", "npm");
}

export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verified(path, entry) {
  try {
    return (await stat(path)).size === entry.size &&
      await checksum(path) === entry.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// The cache is outside npm's package directory: global installs can be read-only,
// and a detached daemon must survive npx pruning its temporary package installation.
export async function ensureBinary({
  root = packageRoot,
  cache = cacheDirectory(),
  platform = process.platform,
  arch = process.arch,
  fetchImpl = fetch,
} = {}) {
  const asset = assetFor(platform, arch);
  const release = await readRelease(root);
  const entry = release.assets[asset];
  const destination = join(cache, entry.sha256, asset);
  if (await verified(destination, entry)) return destination;

  const url = `${releaseBase}/${encodeURIComponent(release.tag)}/${asset}`;
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(join(dirname(destination), ".download-"));
  const pending = join(temporary, asset);
  try {
    console.error(`exomux: downloading ${asset} (${release.tag})…`);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
    }
    const hash = createHash("sha256");
    let size = 0;
    const inspect = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > entry.size) {
          return callback(
            new Error(`Download exceeds expected size for ${asset}`),
          );
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      inspect,
      createWriteStream(pending, { flags: "wx", mode: 0o700 }),
    );
    if (size !== entry.size || hash.digest("hex") !== entry.sha256) {
      throw new Error(
        `Checksum/size mismatch for ${asset}; refusing to run the download. Retry the command.`,
      );
    }
    await chmod(pending, 0o755);
    try {
      await rename(pending, destination);
    } catch (error) {
      // Windows may refuse to replace a binary another successful installer has
      // already started. Only accept that race if its content matches this release.
      if (!await verified(destination, entry)) throw error;
    }
    return destination;
  } catch (error) {
    throw new Error(`Could not install exomux: ${error.message}`, {
      cause: error,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
