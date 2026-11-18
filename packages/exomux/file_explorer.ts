// Copyright 2026 ubernaut. MIT license.

import { basename, dirname, join, resolve } from "node:path";
import { Signal, TreeController, type TreeNode } from "@ubernaut/exotui";
import { MarkdownController } from "@ubernaut/exotui/app";
import { runtimeHost } from "@ubernaut/exotui/runtime";

export const EXOMUX_FILES_WINDOW_ID = "files";
export const EXOMUX_DOCUMENT_WINDOW_ID = "document";
export const EXOMUX_FILE_TREE_START = 2;
export const EXOMUX_DOCUMENT_START = 2;
/** Keep previews and directory listings bounded even outside a project folder. */
export const EXOMUX_PREVIEW_MAX_BYTES = 512 * 1024;
const MAX_DIRECTORY_ENTRIES = 2000;

/** Strip terminal controls from filesystem text before it reaches styled widgets. */
export function exomuxFileText(text: string): string {
  // deno-lint-ignore no-control-regex
  return text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

/** One safe line for a filename, path, or filesystem message. */
export function exomuxFileLabel(text: string): string {
  return exomuxFileText(text).replace(/[\n\t]/g, " ");
}

function note(id: string, text: string): TreeNode {
  return { id, label: exomuxFileLabel(text), note: true };
}

function errorText(error: unknown): string {
  return exomuxFileLabel(error instanceof Error ? error.message : String(error));
}

/** Local, read-only filesystem state. Directories load only when expanded. */
export class ExomuxFileExplorer {
  readonly directory: Signal<string>;
  readonly message: Signal<string> = new Signal("Enter open · ←/→ fold · Backspace parent · r refresh");
  readonly documentPath: Signal<string> = new Signal("");
  readonly document: MarkdownController = new MarkdownController();
  readonly revision: Signal<number> = new Signal(0);
  readonly tree: TreeController;
  #directoryGeneration = 0;
  #documentGeneration = 0;
  #loaded = false;
  #disposed = false;

  constructor(directory: string = runtimeHost.cwd()) {
    this.directory = new Signal(resolve(directory));
    this.tree = new TreeController({
      nodes: [],
      onToggle: async (row, expanded) => {
        if (expanded && row.node.meta?.kind === "directory" && !row.node.meta.loaded) {
          await this.#loadChildren(row.id, String(row.node.meta.path));
        }
      },
    });
  }

  async ensureLoaded(): Promise<void> {
    if (!this.#loaded) await this.setDirectory(this.directory.peek());
  }

  async setDirectory(path: string): Promise<void> {
    if (this.#disposed) return;
    const generation = ++this.#directoryGeneration;
    const directory = resolve(path);
    this.#loaded = true;
    this.directory.value = directory;
    this.tree.nodes.value = [note("loading", "Loading…")];
    this.tree.first();
    try {
      const nodes = await this.#readDirectory(directory);
      if (this.#disposed || generation !== this.#directoryGeneration) return;
      const parent = dirname(directory);
      this.tree.nodes.value = [
        ...(parent !== directory ? [{ id: "parent", label: "..", meta: { kind: "parent", path: parent } }] : []),
        ...nodes,
      ];
      this.message.value = "Enter open · ←/→ fold · Backspace parent · r refresh";
    } catch (error) {
      if (this.#disposed || generation !== this.#directoryGeneration) return;
      this.tree.nodes.value = [
        { id: "parent", label: "..", meta: { kind: "parent", path: dirname(directory) } },
        note("error", errorText(error)),
      ];
      this.message.value = errorText(error);
    }
  }

  async parent(): Promise<void> {
    await this.setDirectory(dirname(this.directory.peek()));
  }

  async refresh(): Promise<void> {
    await this.setDirectory(this.directory.peek());
  }

  /** Returns true only when a file is ready to present in the document window. */
  async activate(): Promise<boolean> {
    const row = this.tree.selected();
    if (!row || row.node.note || this.#disposed) return false;
    const path = String(row.node.meta?.path ?? "");
    if (row.node.meta?.kind === "parent") await this.setDirectory(path);
    else if (row.node.meta?.kind === "directory") this.tree.toggleActive();
    else {
      try {
        // Symlink directories navigate to a new root rather than creating cycles in the tree.
        if ((await runtimeHost.stat(path)).isDirectory) await this.setDirectory(path);
        else return await this.openFile(path);
      } catch (error) {
        if (!this.#disposed) this.message.value = errorText(error);
      }
    }
    return false;
  }

  async openFile(path: string): Promise<boolean> {
    if (this.#disposed) return false;
    const generation = ++this.#documentGeneration;
    try {
      const info = await runtimeHost.stat(path);
      if (!info.isFile) throw new Error("Only regular text files can be previewed.");
      if (info.size > EXOMUX_PREVIEW_MAX_BYTES) throw new Error("Preview limit: 512 KiB.");
      const file = await runtimeHost.open(path, { read: true });
      let source: string;
      try {
        const bytes = new Uint8Array(EXOMUX_PREVIEW_MAX_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
          const count = await file.read(bytes.subarray(length));
          if (count === null || count === 0) break;
          length += count;
        }
        if (length > EXOMUX_PREVIEW_MAX_BYTES) throw new Error("Preview limit: 512 KiB.");
        const content = bytes.subarray(0, length);
        if (content.includes(0)) throw new Error("Binary files cannot be previewed.");
        try {
          source = exomuxFileText(new TextDecoder("utf-8", { fatal: true }).decode(content));
        } catch {
          throw new Error("Preview supports UTF-8 text files.");
        }
      } finally {
        file.close();
      }
      if (this.#disposed || generation !== this.#documentGeneration) return false;
      if (!/\.(?:md|markdown|mdown|mkd)$/i.test(path)) {
        // A longer fence preserves literal Markdown syntax in ordinary text files.
        const runs = source.match(/`+/g) ?? [];
        const fence = "`".repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
        source = `${fence}\n${source}\n${fence}`;
      }
      this.document.setSource(source);
      this.documentPath.value = resolve(path);
      this.revision.value += 1;
      this.message.value = `Opened ${exomuxFileLabel(basename(path))}`;
      return true;
    } catch (error) {
      if (!this.#disposed && generation === this.#documentGeneration) this.message.value = errorText(error);
      return false;
    }
  }

  async #readDirectory(path: string): Promise<TreeNode[]> {
    const entries = [];
    let truncated = false;
    for await (const entry of runtimeHost.readDir(path)) {
      if (entries.length === MAX_DIRECTORY_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push(entry);
    }
    entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
    const nodes: TreeNode[] = entries.map((entry) => {
      const fullPath = join(path, entry.name);
      return {
        id: `entry:${fullPath}`,
        label: `${exomuxFileLabel(entry.name)}${entry.isDirectory ? "/" : entry.isSymlink ? " @" : ""}`,
        meta: { kind: entry.isDirectory ? "directory" : "file", path: fullPath },
        ...(entry.isDirectory ? { children: [note(`pending:${fullPath}`, "Expand to load")] } : {}),
      };
    });
    if (truncated) nodes.push(note(`limit:${path}`, "Listing limited to 2000 entries."));
    if (nodes.length === 0) nodes.push(note(`empty:${path}`, "Empty folder"));
    return nodes;
  }

  async #loadChildren(id: string, path: string): Promise<void> {
    const generation = this.#directoryGeneration;
    let children: TreeNode[];
    try {
      children = await this.#readDirectory(path);
    } catch (error) {
      children = [note(`error:${path}`, errorText(error))];
    }
    if (this.#disposed || generation !== this.#directoryGeneration) return;
    const selected = this.tree.selected()?.id;
    const replace = (nodes: readonly TreeNode[]): TreeNode[] =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, children, meta: { ...node.meta, loaded: true } }
          : node.children
          ? { ...node, children: replace(node.children) }
          : node
      );
    this.tree.nodes.value = replace(this.tree.nodes.peek());
    if (selected) {
      const index = this.tree.visibleRows().findIndex((row) => row.id === selected);
      if (index >= 0) this.tree.setSelectedIndex(index);
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#directoryGeneration += 1;
    this.#documentGeneration += 1;
    this.tree.dispose();
    this.document.dispose();
    this.directory.dispose();
    this.message.dispose();
    this.documentPath.dispose();
    this.revision.dispose();
  }
}
