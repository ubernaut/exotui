// Copyright 2023 Im-Beast. MIT license.

// LOC-006: locale changes as one reactive transaction. The service owns the
// locale context, formatter registry, and message registry behind signals;
// `switchLocale` builds the ENTIRE replacement world off-stage — new
// context, new formatters, new message registry with every tracked namespace
// re-loaded through the same lazy loader — and only then swaps everything in
// one signal batch, bumping one revision. Consumers observe a single
// coherent change; widget state (focus, selection, form values) is never
// touched because the service owns no widgets, only locale-derived services.

import { Signal } from "../signals/mod.ts";
import { UnicodeLocaleContext } from "./locale.ts";
import type { UnicodeLocaleContextOptions } from "./locale.ts";
import { LocaleFormatterRegistry } from "./formatters.ts";
import { MessageBundleRegistry } from "./messages.ts";
import type { MessageChunkLoader } from "./messages.ts";

/** Report of one committed locale switch. */
export interface LocaleSwitchReport {
  readonly previous: string;
  readonly resolved: string;
  readonly revision: number;
  readonly namespacesLoaded: readonly string[];
}

/** Options for the service. */
export interface ReactiveLocaleServiceOptions extends UnicodeLocaleContextOptions {
  readonly loader?: MessageChunkLoader;
}

/** Everything a locale derives, swapped as one value. */
export interface LocaleWorld {
  readonly context: UnicodeLocaleContext;
  readonly formatters: LocaleFormatterRegistry;
  readonly messages: MessageBundleRegistry;
  /** Bumps exactly once per committed switch. */
  readonly revision: number;
}

/** The reactive owner of all locale-derived services. */
export class ReactiveLocaleService {
  /** The current world; one signal, so a switch is one observable update. */
  readonly world: Signal<LocaleWorld>;
  readonly #loader: MessageChunkLoader | undefined;
  readonly #namespaces = new Set<string>();
  #switching = false;

  constructor(options: ReactiveLocaleServiceOptions = {}) {
    this.#loader = options.loader;
    const context = new UnicodeLocaleContext(options);
    this.world = new Signal<LocaleWorld>({
      context,
      formatters: new LocaleFormatterRegistry(context),
      messages: new MessageBundleRegistry(context, { loader: options.loader }),
      revision: 0,
    });
  }

  get context(): UnicodeLocaleContext {
    return this.world.peek().context;
  }

  get formatters(): LocaleFormatterRegistry {
    return this.world.peek().formatters;
  }

  get messages(): MessageBundleRegistry {
    return this.world.peek().messages;
  }

  /** Tracks a namespace: loaded now and after every future switch. */
  async trackNamespace(namespace: string): Promise<void> {
    this.#namespaces.add(namespace);
    await this.messages.ensureLoaded(namespace);
  }

  /**
   * Switches locale transactionally. Everything new is built and loaded
   * before the single batched swap; concurrent switches are refused so two
   * transactions can never interleave.
   */
  async switchLocale(options: UnicodeLocaleContextOptions): Promise<LocaleSwitchReport | undefined> {
    if (this.#switching) return undefined;
    this.#switching = true;
    try {
      const previousWorld = this.world.peek();
      const previous = previousWorld.context.resolve().resolved;
      const nextContext = new UnicodeLocaleContext(options);
      const nextFormatters = new LocaleFormatterRegistry(nextContext);
      const nextMessages = new MessageBundleRegistry(nextContext, { loader: this.#loader });
      const loaded: string[] = [];
      for (const namespace of this.#namespaces) {
        await nextMessages.ensureLoaded(namespace);
        loaded.push(namespace);
      }
      // The swap is one signal assignment — one observable, coherent frame.
      const revision = previousWorld.revision + 1;
      this.world.value = { context: nextContext, formatters: nextFormatters, messages: nextMessages, revision };
      previousWorld.formatters.dispose();
      return {
        previous,
        resolved: nextContext.resolve().resolved,
        revision,
        namespacesLoaded: loaded,
      };
    } finally {
      this.#switching = false;
    }
  }

  inspect(): { readonly resolved: string; readonly revision: number; readonly namespaces: readonly string[] } {
    const world = this.world.peek();
    return {
      resolved: world.context.resolve().resolved,
      revision: world.revision,
      namespaces: [...this.#namespaces].sort(),
    };
  }
}

/** Creates the reactive locale service. */
export function createReactiveLocaleService(options: ReactiveLocaleServiceOptions = {}): ReactiveLocaleService {
  return new ReactiveLocaleService(options);
}
