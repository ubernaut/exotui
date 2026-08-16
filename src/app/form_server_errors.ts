// Copyright 2023 Im-Beast. MIT license.

// FRM-007: structured server errors land where the user can act on them.
// Each error maps by path to a registered field, by group to a declared
// group, or to the form-level summary; errors naming unknown paths are
// preserved verbatim instead of being silently dropped. focus-next-error
// walks the registration order over enabled fields only, wraps around, and
// falls back to the form level when no field owns an error.

import type { FieldName, FormController, FormValues } from "./forms.ts";

/** One structured server error. */
export interface FormServerError {
  /** Field path; absent means group- or form-level. */
  readonly path?: string;
  /** Group id; used when no path (or the path is unknown but grouped). */
  readonly group?: string;
  readonly message: string;
}

/** The mapped result. */
export interface FormServerErrorMapping {
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
  readonly groupErrors: Readonly<Record<string, readonly string[]>>;
  readonly formErrors: readonly string[];
  /** Errors whose path matched nothing — preserved, never dropped. */
  readonly unknown: readonly FormServerError[];
}

/** Where focus should go next. */
export interface FormErrorFocusTarget {
  /** The next enabled field owning an error, or undefined. */
  readonly field?: string;
  /** True when only form-level (or unknown) errors remain. */
  readonly formLevel: boolean;
}

/** Maps a server error payload onto a form's fields, groups, and summary. */
export function mapFormServerErrors<TValues extends FormValues>(
  form: FormController<TValues>,
  errors: readonly FormServerError[],
): FormServerErrorMapping {
  const inspection = form.inspect();
  const fieldNames = new Set(inspection.fields.map((field) => String(field.name)));
  const groupIds = new Set(inspection.groups.map((group) => group.id));

  const fieldErrors: Record<string, string[]> = {};
  const groupErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  const unknown: FormServerError[] = [];

  for (const error of errors) {
    if (error.path && fieldNames.has(error.path)) {
      (fieldErrors[error.path] ??= []).push(error.message);
    } else if (!error.path && error.group && groupIds.has(error.group)) {
      (groupErrors[error.group] ??= []).push(error.message);
    } else if (!error.path && !error.group) {
      formErrors.push(error.message);
    } else {
      unknown.push(error);
    }
  }
  return { fieldErrors, groupErrors, formErrors, unknown };
}

/**
 * The next focus target after `currentField`: enabled fields owning errors,
 * visited in registration order with wrap-around, falling back to the form
 * level when no field qualifies.
 */
export function focusNextFormError<TValues extends FormValues>(
  form: FormController<TValues>,
  mapping: FormServerErrorMapping,
  currentField?: FieldName<TValues>,
): FormErrorFocusTarget {
  const inspection = form.inspect();
  const candidates = inspection.fields
    .filter((field) => !field.disabled && (mapping.fieldErrors[String(field.name)]?.length ?? 0) > 0)
    .map((field) => String(field.name));

  if (candidates.length === 0) {
    return { formLevel: mapping.formErrors.length > 0 || mapping.unknown.length > 0 };
  }
  if (currentField === undefined) return { field: candidates[0], formLevel: false };
  const at = candidates.indexOf(String(currentField));
  const next = candidates[(at + 1) % candidates.length];
  return { field: next, formLevel: false };
}
