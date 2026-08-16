// Copyright 2023 Im-Beast. MIT license.

// FRM-004: explicit field-dependency graph — a source edit recomputes each
// affected field at most once (diamonds converge), cycles are diagnosed and
// excluded, and visibility/enablement/derived/revalidation all propagate.

import { assert, assertEquals } from "./deps.ts";
import { createFormDependencyGraph, FormController } from "../mod.ts";

interface Values extends Record<string, unknown> {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
  total: number;
  shipping: string;
}

function fixture() {
  return new FormController<Values>([
    { name: "quantity", initialValue: 2 },
    { name: "unitPrice", initialValue: 10 },
    { name: "subtotal", initialValue: 20 },
    { name: "tax", initialValue: 2 },
    { name: "total", initialValue: 22 },
    { name: "shipping", initialValue: "pickup" },
  ]);
}

Deno.test("a diamond recomputes its sink exactly once with fresh inputs", () => {
  const form = fixture();
  let totalRuns = 0;
  const graph = createFormDependencyGraph(form, [
    { field: "subtotal", dependsOn: ["quantity", "unitPrice"], derive: (v) => v.quantity * v.unitPrice },
    { field: "tax", dependsOn: ["subtotal"], derive: (v) => v.subtotal * 0.1 },
    {
      field: "total",
      dependsOn: ["subtotal", "tax"],
      derive: (v) => {
        totalRuns += 1;
        return v.subtotal + v.tax;
      },
    },
  ]);
  assertEquals(graph.cycles(), []);

  form.setValue("quantity", 5);
  totalRuns = 0;
  const update = graph.onFieldChange("quantity");
  assertEquals(update.recomputed, ["subtotal", "tax", "total"]);
  assertEquals(totalRuns, 1);
  assertEquals(form.values.peek().subtotal, 50);
  assertEquals(form.values.peek().tax, 5);
  assertEquals(form.values.peek().total, 55);
  assertEquals(update.derived, ["subtotal", "tax", "total"]);
});

Deno.test("visibility and enablement changes are reported; unchanged ones are not", () => {
  const form = fixture();
  const graph = createFormDependencyGraph(form, [
    { field: "shipping", dependsOn: ["quantity"], visible: (v) => v.quantity > 0, enabled: (v) => v.quantity < 100 },
  ]);
  assertEquals(graph.state("shipping"), { visible: true, enabled: true });

  form.setValue("quantity", 0);
  const hidden = graph.onFieldChange("quantity");
  assertEquals(hidden.visibilityChanged, ["shipping"]);
  assertEquals(hidden.enablementChanged, []);
  assertEquals(graph.state("shipping"), { visible: false, enabled: true });

  form.setValue("quantity", 500);
  const disabled = graph.onFieldChange("quantity");
  assertEquals(disabled.visibilityChanged, ["shipping"]);
  assertEquals(disabled.enablementChanged, ["shipping"]);
  assertEquals(graph.state("shipping"), { visible: true, enabled: false });
});

Deno.test("derive cycles are diagnosed at construction and never propagate", () => {
  const form = fixture();
  const graph = createFormDependencyGraph(form, [
    { field: "subtotal", dependsOn: ["total"], derive: (v) => v.total - v.tax },
    { field: "total", dependsOn: ["subtotal"], derive: (v) => v.subtotal + v.tax },
    { field: "shipping", dependsOn: ["quantity"], visible: (v) => v.quantity > 0 },
  ]);
  assertEquals(graph.cycles().length, 1);
  assert(graph.inspect().cyclicFields.includes("subtotal") && graph.inspect().cyclicFields.includes("total"));

  form.setValue("subtotal", 99);
  const update = graph.onFieldChange("subtotal");
  assertEquals(update.recomputed, []); // the cyclic pair is excluded
  // Non-cyclic rules still work.
  form.setValue("quantity", 3);
  assertEquals(graph.onFieldChange("quantity").recomputed, ["shipping"]);
});

Deno.test("revalidation fires for dependent fields", () => {
  const form = new FormController<Values>([
    { name: "quantity", initialValue: 2 },
    { name: "unitPrice", initialValue: 10 },
    {
      name: "subtotal",
      initialValue: 20,
      validators: [(value, values) => (value as number) === values.quantity * values.unitPrice ? undefined : "stale"],
    },
    { name: "tax", initialValue: 2 },
    { name: "total", initialValue: 22 },
    { name: "shipping", initialValue: "pickup" },
  ]);
  const graph = createFormDependencyGraph(form, [
    { field: "subtotal", dependsOn: ["quantity"], revalidate: true },
  ]);
  form.setValue("quantity", 7); // subtotal (20) is now stale
  const update = graph.onFieldChange("quantity");
  assertEquals(update.revalidated, ["subtotal"]);
  assertEquals(form.errors.peek()["subtotal"], ["stale"]);
});
