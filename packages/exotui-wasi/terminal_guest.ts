// The componentizer supplies the WIT import at runtime, not the JS bundler.
// @ts-ignore: WIT module resolved by jco.
import * as terminal from "exotui:host/terminal@0.1.0";
import { createDesktopApp } from "../../examples/web/desktop_app.ts";
import { runShellApp } from "../../src/app/shell_presenter.ts";
import { consolePresenterForHost } from "../../src/runtime/console_presenter.ts";
import type { AsyncStore } from "../../src/runtime/storage.ts";
import { stateStore } from "./state_store.ts";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const run = {
  async run(): Promise<void> {
    let quit = false;
    let failure: unknown;
    const presenter = consolePresenterForHost({
      stdin: {
        setRaw() {}, // The launcher owns terminal modes and restores them on trap.
        async read(target) {
          while (!quit && !terminal.stopped()) {
            const bytes: Uint8Array = terminal.read();
            const interrupt = bytes.indexOf(3);
            if (interrupt >= 0) {
              quit = true;
              return null;
            }
            if (bytes.length) {
              target.set(bytes);
              return bytes.length;
            }
            await delay(10);
          }
          return null;
        },
      },
      stdout: {
        writeSync(bytes) {
          terminal.write(bytes);
          return bytes.length;
        },
      },
      cbreak: false,
      size: terminal.size,
      onInputError(error) {
        failure = error;
        quit = true;
      },
      store<T>(name: string): AsyncStore<T> {
        return stateStore<T>({
          get: (key) => terminal.get(name, key),
          set: (key, value) => terminal.set(name, key, value),
          delete: (key) => terminal.delete(name, key),
        }, (error) => console.error(`Desktop state: ${String(error)}`));
      },
    });
    let handle: ReturnType<typeof runShellApp> | undefined;
    try {
      const app = createDesktopApp();
      await app.init?.(presenter);
      handle = runShellApp(presenter, { ...app, init: undefined });
      while (!quit && !terminal.stopped()) await delay(15);
      if (failure !== undefined) throw failure;
    } finally {
      quit = true;
      if (handle) handle.stop();
      else presenter.dispose();
    }
  },
};
