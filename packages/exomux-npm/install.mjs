import { ensureBinary, readRelease } from "./lib/binary.mjs";

try {
  if (process.argv.includes("--check")) await readRelease();
  else await ensureBinary();
} catch (error) {
  console.error(`exomux: ${error.message}`);
  process.exitCode = 1;
}
