import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assets, checksum, validateRelease } from "../packages/exomux-npm/lib/binary.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

// Stage separately from the private template. The application manifest is the
// version authority; the release tag belongs to exotui and can differ from it.
export async function preparePackage(
  { tag, binaries, output, repository = repoRoot },
) {
  const template = join(repository, "packages/exomux-npm");
  const pkg = JSON.parse(
    await readFile(join(template, "package.json"), "utf8"),
  );
  const app = JSON.parse(
    await readFile(join(repository, "packages/exomux/deno.json"), "utf8"),
  );
  const release = { version: app.version, tag, assets: {} };
  for (const asset of Object.values(assets)) {
    const path = join(binaries, asset);
    release.assets[asset] = {
      sha256: await checksum(path),
      size: (await stat(path)).size,
    };
  }
  validateRelease(release, app.version);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Never reuse a staging directory carrying a different release.
  for (const path of ["bin", "lib", "install.mjs", "README.md"]) {
    await cp(join(template, path), join(output, path), { recursive: true });
  }
  await cp(join(repository, "LICENSE.md"), join(output, "LICENSE.md"));
  pkg.version = app.version;
  delete pkg.private;
  delete pkg.scripts.test;
  await writeFile(
    join(output, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  await writeFile(
    join(output, "release.json"),
    JSON.stringify(release, null, 2) + "\n",
  );
  return release;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [tag, binaries, output] = process.argv.slice(2);
  if (!tag || !binaries || !output) {
    console.error(
      "Usage: node scripts/prepare_exomux_npm.mjs <release-tag> <binary-directory> <new-output-directory>",
    );
    process.exitCode = 1;
  } else {
    const release = await preparePackage({
      tag,
      binaries: resolve(binaries),
      output: resolve(output),
    });
    console.log(
      `Prepared @ubernaut/exomux@${release.version} from ${release.tag} in ${output}`,
    );
  }
}
