import { runtimeHost } from "../src/runtime/host.ts";
import { formatLayoutRecipeMarkdown, inspectLayoutRecipe, type ResponsiveLayoutRecipe } from "../mod.ts";

type SlotId = "header" | "nav" | "main" | "details" | "footer";

const recipe: ResponsiveLayoutRecipe<SlotId> = {
  breakpoints: [
    { id: "compact" },
    { id: "wide", minWidth: 100 },
    { id: "tall", minHeight: 40 },
  ],
  fallback: "compact",
  layouts: {
    compact: {
      dock: "top",
      size: 2,
      gap: 1,
      panel: { id: "header" },
      body: { id: "main", inset: 1 },
    },
    wide: {
      split: "row",
      ratio: 0.25,
      gap: 1,
      first: { id: "nav", minWidth: 12 },
      second: {
        dock: "bottom",
        size: 1,
        panel: { id: "footer" },
        body: {
          split: "row",
          ratio: 0.7,
          gap: 1,
          first: { id: "main" },
          second: { id: "details", minWidth: 16 },
        },
      },
    },
  },
};

if (runtimeHost.args.includes("--json")) {
  console.log(JSON.stringify(inspectLayoutRecipe(recipe), null, 2));
} else {
  console.log(formatLayoutRecipeMarkdown(recipe, { title: "Responsive Shell Recipe" }));
}
