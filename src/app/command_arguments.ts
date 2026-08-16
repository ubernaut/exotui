// Copyright 2023 Im-Beast. MIT license.

// AUT-002: command arguments as JSON Schema. A command declares its
// argument schema once; the FRM-010 renderer turns it into prompt fields
// for interactive hosts, and the SAME schema validator becomes the
// command's input gate — so a validated prompt submission is assignable to
// the command input by construction, and headless callers pass through the
// identical validator with the identical rejections.

import { renderJsonSchemaForm, validateAgainstSchema } from "./form_schema.ts";
import type { SchemaFormField, SchemaWidgetResolver } from "./form_schema.ts";
import type { TypedCommand, TypedCommandRegistry } from "./typed_commands.ts";

/** A command declared through an argument schema. */
export interface SchemaCommand<TInput = unknown, TResult = unknown> {
  readonly id: string;
  readonly title?: string;
  readonly argumentSchema: Readonly<Record<string, unknown>>;
  run(input: TInput, context: Parameters<TypedCommand<TInput, TResult>["run"]>[1]): Promise<TResult> | TResult;
}

/** The rendered prompt for one command. */
export interface CommandPrompt {
  readonly commandId: string;
  readonly fields: readonly SchemaFormField[];
  /** Validates a candidate submission with the command's own validator. */
  validate(values: unknown): { readonly valid: boolean; readonly errors: readonly { path: string; detail: string }[] };
}

/** Registers schema commands and renders their prompts. */
export class SchemaCommandBinder {
  readonly #registry: TypedCommandRegistry;
  readonly #schemas = new Map<string, Readonly<Record<string, unknown>>>();

  constructor(registry: TypedCommandRegistry) {
    this.#registry = registry;
  }

  /**
   * Registers a schema command. The input gate IS the schema validator:
   * headless invocations and prompt submissions face the same checks.
   */
  register<TInput, TResult>(command: SchemaCommand<TInput, TResult>): () => void {
    this.#schemas.set(command.id, command.argumentSchema);
    const dispose = this.#registry.register<TInput, TResult>({
      id: command.id,
      title: command.title,
      inputSummary: JSON.stringify(command.argumentSchema),
      validateInput: (input) => {
        const report = validateAgainstSchema(command.argumentSchema, input);
        if (report.valid) return undefined;
        return report.errors.map((error) => `${error.path}: ${error.detail}`).join("; ");
      },
      run: command.run,
    });
    return () => {
      this.#schemas.delete(command.id);
      dispose();
    };
  }

  /** Renders the prompt through the form registry (overridable widgets). */
  prompt(
    commandId: string,
    options: { readonly resolveWidget?: SchemaWidgetResolver } = {},
  ): CommandPrompt | undefined {
    const schema = this.#schemas.get(commandId);
    if (!schema) return undefined;
    const { fields } = renderJsonSchemaForm(schema, options);
    return {
      commandId,
      fields,
      validate: (values) => {
        const report = validateAgainstSchema(schema, values);
        return {
          valid: report.valid,
          errors: report.errors.map((error) => ({ path: error.path, detail: error.detail })),
        };
      },
    };
  }
}

/** Creates a schema-command binder over a typed registry. */
export function createSchemaCommandBinder(registry: TypedCommandRegistry): SchemaCommandBinder {
  return new SchemaCommandBinder(registry);
}
