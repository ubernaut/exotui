// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice E. Saved themes on disk: one JSON document per theme in a
// directory beside the config file, so a theme is a file you can copy to
// another machine, read in an editor, or delete.

import type { ThemeStoragePort } from "@ubernaut/exotui";

const THEME_FILE = /^[a-z0-9][a-z0-9-]{0,63}\.json$/;

/**
 * A storage port over one directory. Ids are already slugged by the library,
 * and this refuses anything that does not look like a slug — the id reaches
 * the filesystem, and a theme called "../../etc/passwd" must not.
 */
export function createExomuxThemeStorage(directory: string): ThemeStoragePort {
  const pathOf = (id: string): string | undefined => {
    const file = `${id}.json`;
    return THEME_FILE.test(file) ? `${directory}/${file}` : undefined;
  };
  return {
    async list(): Promise<readonly string[]> {
      const ids: string[] = [];
      try {
        for await (const entry of Deno.readDir(directory)) {
          if (!entry.isFile || !THEME_FILE.test(entry.name)) continue;
          ids.push(entry.name.slice(0, -".json".length));
        }
      } catch (error) {
        // No directory yet simply means no saved themes.
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      return ids.sort();
    },
    async read(id: string): Promise<string | undefined> {
      const path = pathOf(id);
      if (!path) return undefined;
      try {
        return await Deno.readTextFile(path);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return undefined;
        throw error;
      }
    },
    async write(id: string, json: string): Promise<void> {
      const path = pathOf(id);
      if (!path) throw new TypeError(`"${id}" is not a theme id`);
      await Deno.mkdir(directory, { recursive: true });
      // Write and rename, so an interrupted save never leaves half a theme.
      const temporary = `${path}.tmp-${crypto.randomUUID()}`;
      await Deno.writeTextFile(temporary, `${json}\n`);
      await Deno.rename(temporary, path);
    },
    async remove(id: string): Promise<void> {
      const path = pathOf(id);
      if (!path) return;
      try {
        await Deno.remove(path);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    },
  };
}
