// Copyright 2023 Im-Beast. MIT license.

// FRM-010: a bounded JSON Schema 2020-12 subset rendered into the existing
// controller vocabulary through an overridable widget registry. Supported:
// object/properties (nested, dot paths), string (enum, minLength/maxLength,
// pattern, format), number/integer (minimum/maximum), boolean, required.
// Anything outside the subset ($ref, oneOf, allOf, arrays, …) emits a
// source-located diagnostic instead of guessing. Validation implements the
// SAME subset, so what the rendered form constrains is exactly what
// submitted values are checked against.

/** One renderable field derived from the schema. */
export interface SchemaFormField {
  readonly path: string;
  readonly widget: string;
  readonly label: string;
  readonly required: boolean;
  readonly schema: Readonly<Record<string, unknown>>;
  /** Enum options for select-like widgets. */
  readonly options?: readonly string[];
}

/** A schema-location diagnostic. */
export interface SchemaDiagnostic {
  /** JSON-pointer-style location inside the schema document. */
  readonly location: string;
  readonly keyword: string;
  readonly detail: string;
}

/** Overridable schema→widget mapping; return undefined to defer. */
export type SchemaWidgetResolver = (schema: Readonly<Record<string, unknown>>, path: string) => string | undefined;

const UNSUPPORTED_KEYWORDS = ["$ref", "oneOf", "anyOf", "allOf", "not", "if", "patternProperties", "$dynamicRef"];

function defaultWidget(schema: Readonly<Record<string, unknown>>): string | undefined {
  const type = schema["type"];
  if (type === "boolean") return "checkbox";
  if (type === "string") return Array.isArray(schema["enum"]) ? "select" : "input";
  if (type === "number" || type === "integer") return "number-input";
  return undefined;
}

/** Renders a schema into fields + diagnostics. */
export function renderJsonSchemaForm(
  schema: Readonly<Record<string, unknown>>,
  options: { readonly resolveWidget?: SchemaWidgetResolver } = {},
): { readonly fields: readonly SchemaFormField[]; readonly diagnostics: readonly SchemaDiagnostic[] } {
  const fields: SchemaFormField[] = [];
  const diagnostics: SchemaDiagnostic[] = [];

  const visit = (node: Readonly<Record<string, unknown>>, path: string, location: string, required: boolean): void => {
    for (const keyword of UNSUPPORTED_KEYWORDS) {
      if (keyword in node) {
        diagnostics.push({ location: `${location}/${keyword}`, keyword, detail: "outside the supported subset" });
      }
    }
    if (node["type"] === "object") {
      const properties = node["properties"] as Record<string, Record<string, unknown>> | undefined;
      const requiredList = Array.isArray(node["required"]) ? node["required"] as string[] : [];
      for (const [name, child] of Object.entries(properties ?? {})) {
        visit(
          child,
          path ? `${path}.${name}` : name,
          `${location}/properties/${name}`,
          requiredList.includes(name),
        );
      }
      return;
    }
    if (node["type"] === "array") {
      diagnostics.push({ location: `${location}/type`, keyword: "array", detail: "arrays are outside the subset" });
      return;
    }
    const widget = options.resolveWidget?.(node, path) ?? defaultWidget(node);
    if (!widget) {
      diagnostics.push({
        location: `${location}/type`,
        keyword: "type",
        detail: `no widget for type "${String(node["type"])}"`,
      });
      return;
    }
    fields.push({
      path,
      widget,
      label: typeof node["title"] === "string" ? node["title"] : path.split(".").at(-1) ?? path,
      required,
      schema: node,
      options: Array.isArray(node["enum"]) ? (node["enum"] as unknown[]).map(String) : undefined,
    });
  };
  visit(schema, "", "#", false);
  return { fields, diagnostics };
}

/** A validation error against the same subset. */
export interface SchemaValidationError {
  readonly path: string;
  readonly keyword: string;
  readonly detail: string;
}

function readPath(value: unknown, path: string): unknown {
  if (path === "") return value;
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Validates a submitted value against the SAME rendered subset. */
export function validateAgainstSchema(
  schema: Readonly<Record<string, unknown>>,
  value: unknown,
): { readonly valid: boolean; readonly errors: readonly SchemaValidationError[] } {
  const errors: SchemaValidationError[] = [];
  const { fields } = renderJsonSchemaForm(schema);

  const requiredCheck = (node: Readonly<Record<string, unknown>>, path: string): void => {
    if (node["type"] !== "object") return;
    const requiredList = Array.isArray(node["required"]) ? node["required"] as string[] : [];
    const properties = node["properties"] as Record<string, Record<string, unknown>> | undefined;
    for (const name of requiredList) {
      const childPath = path ? `${path}.${name}` : name;
      if (readPath(value, childPath) === undefined) {
        errors.push({ path: childPath, keyword: "required", detail: "value is required" });
      }
    }
    for (const [name, child] of Object.entries(properties ?? {})) {
      requiredCheck(child, path ? `${path}.${name}` : name);
    }
  };
  requiredCheck(schema, "");

  for (const field of fields) {
    const submitted = readPath(value, field.path);
    if (submitted === undefined) continue; // required handled above
    const node = field.schema;
    const type = node["type"];
    if (type === "string" && typeof submitted !== "string") {
      errors.push({ path: field.path, keyword: "type", detail: "expected a string" });
      continue;
    }
    if ((type === "number" || type === "integer") && typeof submitted !== "number") {
      errors.push({ path: field.path, keyword: "type", detail: "expected a number" });
      continue;
    }
    if (type === "boolean" && typeof submitted !== "boolean") {
      errors.push({ path: field.path, keyword: "type", detail: "expected a boolean" });
      continue;
    }
    if (type === "integer" && typeof submitted === "number" && !Number.isInteger(submitted)) {
      errors.push({ path: field.path, keyword: "integer", detail: "expected an integer" });
    }
    if (Array.isArray(node["enum"]) && !(node["enum"] as unknown[]).includes(submitted)) {
      errors.push({ path: field.path, keyword: "enum", detail: "value is not one of the allowed options" });
    }
    if (typeof submitted === "string") {
      const min = node["minLength"];
      const max = node["maxLength"];
      if (typeof min === "number" && submitted.length < min) {
        errors.push({ path: field.path, keyword: "minLength", detail: `shorter than ${min}` });
      }
      if (typeof max === "number" && submitted.length > max) {
        errors.push({ path: field.path, keyword: "maxLength", detail: `longer than ${max}` });
      }
      const pattern = node["pattern"];
      if (typeof pattern === "string" && !new RegExp(pattern).test(submitted)) {
        errors.push({ path: field.path, keyword: "pattern", detail: `does not match ${pattern}` });
      }
    }
    if (typeof submitted === "number") {
      const minimum = node["minimum"];
      const maximum = node["maximum"];
      if (typeof minimum === "number" && submitted < minimum) {
        errors.push({ path: field.path, keyword: "minimum", detail: `below ${minimum}` });
      }
      if (typeof maximum === "number" && submitted > maximum) {
        errors.push({ path: field.path, keyword: "maximum", detail: `above ${maximum}` });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
