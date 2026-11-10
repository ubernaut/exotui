// Copyright 2023 Im-Beast. MIT license.
import { generatedCounterContexts } from "../../../src/content/mermaid_counters_dom.ts";
import { generatedCounterFunctionValue } from "../../../src/content/mermaid_counter_styles.ts";
import { generatedQuotedContentValue } from "../../../src/content/mermaid_quotes.ts";

interface Fixture {
  name: string;
  ancestor?: string;
  contain?: boolean;
  before?: string;
  body: string;
  rules: readonly (readonly [string, string])[];
  /** Original function data is supplied separately for the preserved CSSOM loss. */
  originalBefore?: string;
}

// Original source is authored independently of the inheritance implementation.
// The oracle driver reads Chromium AX; that text is never used by the model.
const fixtures: readonly Fixture[] = [
  {
    name: "ancestor-boundary",
    ancestor: "counter-reset:x 4",
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "ancestor-no-boundary",
    ancestor: "counter-reset:x 4",
    contain: false,
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "preceding-reset",
    before: '<div style="counter-reset:x 4"></div>',
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "preceding-set",
    ancestor: "counter-reset:x 4",
    before: '<div style="counter-set:x 9"></div>',
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "hidden-increment",
    ancestor: "counter-reset:x 4",
    before: '<div style="visibility:hidden;counter-increment:x 2"></div>',
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "nonbox-increment",
    ancestor: "counter-reset:x 4",
    before: '<div style="display:none;counter-increment:x 2"></div>',
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "external-contained-increment",
    ancestor: "counter-reset:x 4",
    before: '<div style="contain:style;counter-increment:x 2"></div>',
    body: '<span class="g">inside</span>',
    rules: [[".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "internal-contained-increment",
    ancestor: "counter-reset:x 4",
    body: '<span class="g">inside</span>',
    rules: [[".g", "contain:style"], [".g::before", "counter-increment:x;content:counter(x) ':'"]],
  },
  {
    name: "parent-after-nested-reset",
    body: '<div class="g">outer<span class="g child">inner</span></div>',
    rules: [[".g", "counter-reset:x 1"], [".child", "counter-reset:x 4"], [
      ".g::before",
      'counter-increment:x;content:counters(x,".") ":"',
    ], [".g:not(.child)::after", 'content:":" counter(x)']],
  },
  {
    name: "parent-after-child-increment",
    body: '<div class="g">outer<span class="child">inner</span></div>',
    rules: [
      [".g", "counter-reset:x 1"],
      [".child", "counter-increment:x 4"],
      [".g::before", 'content:counter(x) ":"'],
      [".g::after", 'content:":" counter(x)'],
    ],
  },
  {
    name: "pseudo-reset-contained",
    ancestor: "counter-reset:x 4",
    body: '<span class="g">inside</span>',
    rules: [[".g::before", 'counter-reset:x 2;content:counters(x,".") ":"'], [
      ".g::after",
      'content:":" counters(x,".")',
    ]],
  },
  {
    name: "pseudo-reset-no-boundary",
    ancestor: "counter-reset:x 4",
    contain: false,
    body: '<span class="g">inside</span>',
    rules: [[".g::before", 'counter-reset:x 2;content:counters(x,".") ":"'], [
      ".g::after",
      'content:":" counters(x,".")',
    ]],
  },
  {
    name: "implicit-list",
    body: '<ol start="4"><li class="g">one</li><li class="g" value="9">two</li><li class="g">three</li></ol>',
    rules: [["li", "list-style:none"], [".g::before", 'content:counter(list-item) ":"']],
  },
  {
    name: "reversed-list",
    body: '<ol reversed><li class="g">one</li><li class="g">two</li><li class="g">three</li></ol>',
    rules: [["li", "list-style:none"], [".g::before", 'content:counter(list-item) ":"']],
  },
  {
    name: "reversed-counter-contained",
    ancestor: "counter-reset:reversed(x)",
    body: '<span class="g">one</span><span class="g">two</span><span class="g">three</span>',
    rules: [[".g::before", 'counter-increment:x -1;content:counter(x) ":"']],
  },
  {
    name: "reversed-counter-no-boundary",
    ancestor: "counter-reset:reversed(x)",
    contain: false,
    body: '<span class="g">one</span><span class="g">two</span><span class="g">three</span>',
    rules: [[".g::before", 'counter-increment:x -1;content:counter(x) ":"']],
  },
  {
    name: "reversed-explicit",
    ancestor: "counter-reset:reversed(x) 9",
    contain: false,
    body: '<span class="g">one</span><span class="g">two</span>',
    rules: [[".g::before", 'counter-increment:x -2;content:counter(x) ":"']],
  },
  {
    name: "reversed-nested-and-set",
    ancestor: "counter-reset:reversed(x)",
    contain: false,
    body:
      '<span class="g">one</span><div style="counter-reset:x 90"><span class="g">nested</span></div><span class="g" style="counter-set:x 7">set</span><span class="g">last</span>',
    rules: [[".g::before", 'counter-increment:x -2;content:counter(x) ":"']],
  },
  {
    name: "missing-counters",
    body: '<span class="g">inside</span>',
    rules: [[".g::before", 'content:counters(absent,".") ":" counter(x) ":"']],
  },
  {
    name: "same-element-combined",
    body: '<span class="g">inside</span>',
    rules: [[".g", "counter-reset:x 4 x 7;counter-increment:x 2 x 3;counter-set:x 9 x 8"], [
      ".g::before",
      'content:counter(x) ":"',
    ]],
  },
  {
    name: "same-pseudo-combined",
    body: '<span class="g">inside</span>',
    rules: [[".g::before", 'counter-reset:x 4;counter-increment:x 3;counter-set:x 9;content:counter(x) ":"']],
  },
  {
    name: "after-writes",
    body: '<span class="g">one<span class="child">child</span></span><span class="g">two</span>',
    rules: [[".g:first-child", "counter-reset:x 4"], [".child", "counter-increment:x 2"], [
      ".g::before",
      'content:counter(x) ":"',
    ], [".g::after", 'counter-increment:x;content:":" counter(x)']],
  },
  {
    name: "contents-reset-ignored",
    body:
      '<div style="counter-reset:x 2"><div style="display:contents;counter-reset:x 4"><span class="g">inside</span></div></div>',
    rules: [[".g::before", 'counter-increment:x;content:counters(x,".") ":"']],
  },
  {
    name: "contents-pseudo",
    body: '<div style="counter-reset:x 2"><div class="g" style="display:contents;counter-reset:x 4">inside</div></div>',
    rules: [[".g::before", 'counter-increment:x;content:counter(x) ":"']],
  },
  {
    name: "hidden-owner-increment",
    body:
      '<div style="counter-reset:x 4"><span style="visibility:hidden;counter-increment:x 2">hidden</span><span class="g">inside</span></div>',
    rules: [[".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "hidden-content",
    body:
      '<div style="counter-reset:x 4"><div style="content-visibility:hidden;counter-increment:x 2"><span style="counter-increment:x 99">hidden</span></div><span class="g">inside</span></div>',
    rules: [[".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "closed-details",
    body:
      '<div style="counter-reset:x 4"><details><summary style="counter-increment:x 2">summary</summary><span style="counter-increment:x 99">hidden</span></details><span class="g">inside</span></div>',
    rules: [[".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "marker-directive",
    body: '<div style="counter-reset:x 4"><ul><li class="g">one</li><li class="g">two</li></ul></div>',
    rules: [["li::marker", 'counter-increment:x;content:""'], [".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "none-pseudo-ignored",
    body: '<div style="counter-reset:x 4"><span class="hidden"></span><span class="g">inside</span></div>',
    rules: [[".hidden::before", "counter-increment:x 99;content:none"], [".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "empty-pseudo-contributes",
    body: '<div style="counter-reset:x 4"><span class="empty"></span><span class="g">inside</span></div>',
    rules: [[".empty::before", 'counter-increment:x 2;content:""'], [".g::before", 'content:counter(x) ":"']],
  },
  {
    name: "pseudo-containment",
    body: '<span class="g" style="counter-reset:x 4">inside</span>',
    rules: [[".g::before", 'contain:style;counter-increment:x;content:counter(x) ":"'], [
      ".g::after",
      'content:":" counter(x)',
    ]],
  },
  {
    name: "integer-overflow",
    body: '<span class="g" style="counter-reset:x 2147483647">inside</span>',
    rules: [[".g::before", 'counter-increment:x;content:counter(x) ":"'], [
      ".g::after",
      'counter-set:x -2147483648;counter-increment:x -2;content:":" counter(x)',
    ]],
  },
  {
    name: "original-empty-separator",
    ancestor: "counter-reset:x 2",
    body: '<div style="counter-reset:x 4"><span class="g" style="counter-reset:x 9">inside</span></div>',
    originalBefore: 'counters(x,"") ":"',
    rules: [[".g::before", 'content:counters(x,"") ":"']],
  },
  {
    name: "counter-alternative",
    body: '<span class="g" style="counter-reset:x 9">inside</span>',
    rules: [[".g::before", 'content:"visual" / counter(x,upper-roman)']],
  },
  {
    name: "actual-missing-five",
    body: '<span class="g" style="counter-reset:x 4">inside</span>',
    rules: [[".g::before", 'counter-increment:x;content:counter(x) ":"']],
  },
];

let owned: HTMLElement | undefined;
export function disposeMermaidCounterContextOracle(): void {
  owned?.remove();
  owned = undefined;
}

/** Read-only quota/flattened-host checks; source AX comparisons stay in the driver. */
export function mermaidCounterContextGuards(profile: "chromium-legacy" | "css-accounting"): string[] {
  const passed: string[] = [], root = document.createElement("div"), button = document.createElement("button");
  root.id = "counter-guard";
  root.style.contain = "style";
  root.innerHTML =
    '<style>#counter-guard .g::before{counter-increment:x;content:counter(x)}</style><svg width="600" height="200"><foreignObject width="590" height="190"><div xmlns="http://www.w3.org/1999/xhtml"><span class="g" style="counter-reset:x 4">inside</span></div></foreignObject></svg>';
  root.append(button);
  document.body.append(root);
  const svg = root.querySelector("svg")!,
    owner = root.querySelector<HTMLElement>(".g")!,
    owners = new Set([owner]),
    names = new Set(["x"]);
  const read = () => generatedCounterContexts(svg, owners, names, profile);
  const check = (name: string, test: () => void) => {
    test();
    passed.push(name);
  };
  const failure = (test: () => unknown) => {
    const before = root.outerHTML;
    let failed = false;
    try {
      test();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      failed = true;
    }
    if (!failed || root.outerHTML !== before) throw new Error("Counter quota did not refuse without mutating source.");
  };
  const five = (context = read()) => {
    if (JSON.stringify(context.get(owner)?.before.get("x")) !== "[5]") {
      throw new Error("Counter guard lost original 5.");
    }
  };
  try {
    check("original-state-and-markup", () => {
      const before = root.outerHTML;
      five();
      if (root.outerHTML !== before) throw new Error("Counter capture wrote its host.");
    });
    check("focus-and-backward-selection", () => {
      const text = owner.firstChild!, selection = document.getSelection()!;
      button.focus();
      selection.setBaseAndExtent(text, 5, text, 1);
      five();
      if (
        document.activeElement !== button || selection.anchorNode !== text || selection.anchorOffset !== 5 ||
        selection.focusOffset !== 1
      ) throw new Error("Counter capture changed focus/selection.");
      selection.removeAllRanges();
    });
    check(
      "owner-budget",
      () =>
        failure(() =>
          generatedCounterContexts(
            svg,
            new Set(Array.from({ length: 1025 }, () => document.createElement("span"))),
            names,
            profile,
          )
        ),
    );
    check(
      "name-budget",
      () =>
        failure(() =>
          generatedCounterContexts(svg, owners, new Set(Array.from({ length: 257 }, (_, i) => `x${i}`)), profile)
        ),
    );
    check(
      "name-length",
      () => failure(() => generatedCounterContexts(svg, owners, new Set(["x".repeat(4097)]), profile)),
    );
    check("computed-token-budget", () => {
      owner.setAttribute("style", "counter-reset:" + "x 1 ".repeat(129));
      try {
        failure(read);
      } finally {
        owner.setAttribute("style", "counter-reset:x 4");
      }
      five();
    });
    check("following-host-is-not-scanned", () => {
      const following = document.createElement("div");
      for (let count = 0; count < 33000; count++) following.append(document.createElement("i"));
      root.append(following);
      try {
        five();
      } finally {
        following.remove();
      }
    });
    check("preceding-host-budget-and-recovery", () => {
      const preceding = document.createElement("div");
      for (let count = 0; count < 33000; count++) preceding.append(document.createElement("i"));
      root.insertBefore(preceding, svg);
      try {
        failure(read);
      } finally {
        preceding.remove();
      }
      five();
    });
    check("flattened-contents-depth-and-recovery", () => {
      const nested = document.createElement("div");
      let last = nested;
      for (let depth = 0; depth < 260; depth++) {
        const child = document.createElement("div");
        child.style.display = "contents";
        last.append(child);
        last = child;
      }
      const parent = owner.parentNode!;
      last.append(owner);
      parent.append(nested);
      try {
        failure(read);
      } finally {
        parent.append(owner);
        nested.remove();
      }
      five();
    });
    for (const mode of ["open", "closed"] as const) {
      check(`${mode}-shadow-ancestor`, () => {
        const host = document.createElement("div"),
          shadow = host.attachShadow({ mode }),
          originalParent = svg.parentNode!,
          next = svg.nextSibling;
        shadow.innerHTML = "<style>.g::before{counter-increment:x;content:counter(x)}</style>";
        root.append(host);
        shadow.append(svg);
        try {
          five();
        } finally {
          originalParent.insertBefore(svg, next);
          host.remove();
        }
      });
    }
    check("flattened-slot-order", () => {
      const host = document.createElement("div"),
        shadow = host.attachShadow({ mode: "open" }),
        originalParent = svg.parentNode!,
        next = svg.nextSibling;
      shadow.innerHTML = '<slot name="reset"></slot><slot name="diagram"></slot>';
      const reset = document.createElement("div");
      reset.slot = "reset";
      reset.style.counterReset = "x 8";
      svg.setAttribute("slot", "diagram");
      owner.style.counterReset = "none";
      host.append(svg, reset);
      root.append(host);
      try {
        if (JSON.stringify(read().get(owner)?.before.get("x")) !== "[9]") {
          throw new Error("Counter traversal used authored rather than assigned order.");
        }
      } finally {
        originalParent.insertBefore(svg, next);
        svg.removeAttribute("slot");
        owner.style.counterReset = "x 4";
        host.remove();
      }
      five();
    });
    const frame = document.createElement("iframe");
    root.append(frame);
    try {
      const foreign = frame.contentDocument!;
      foreign.body.innerHTML = "<style>.g::before{counter-increment:x;content:counter(x)}</style>" + svg.outerHTML;
      const foreignSvg = foreign.querySelector("svg")!, foreignOwner = foreign.querySelector(".g")!;
      check("same-origin-window", () => {
        const context = generatedCounterContexts(foreignSvg, new Set([foreignOwner]), names, profile);
        if (JSON.stringify(context.get(foreignOwner)?.before.get("x")) !== "[5]") {
          throw new Error("Counter capture rejected another same-origin Window.");
        }
      });
    } finally {
      frame.remove();
    }
    return passed;
  } finally {
    root.remove();
  }
}

/** Mount originals and predict from read-only original state, never from browser AX text. */
export function mountMermaidCounterContextOracle(profile: "chromium-legacy" | "css-accounting" = "chromium-legacy"): {
  id: string;
  name: string;
  expected: string;
  originalContent?: true;
  reversedSyntaxSupported?: boolean;
}[] {
  disposeMermaidCounterContextOracle();
  const root = document.createElement("div");
  root.style.contain = "style";
  document.body.append(root);
  owned = root;
  return fixtures.map((fixture, index) => {
    const id = `counter-context-${index}`,
      ancestor = document.createElement("div"),
      style = document.createElement("style");
    ancestor.id = id;
    ancestor.style.cssText = `${fixture.contain === false ? "" : "contain:style;"}${fixture.ancestor ?? ""}`;
    style.textContent = fixture.rules.map(([selectors, declaration]) =>
      `${selectors.split(",").map((selector) => `#${id} ${selector}`).join(",")}{${declaration}}`
    ).join("\n");
    const source = document.createElement("div");
    source.setAttribute("role", "document");
    source.setAttribute("aria-label", id);
    source.innerHTML =
      `<svg width="700" height="300"><foreignObject width="690" height="290"><div xmlns="http://www.w3.org/1999/xhtml">${fixture.body}</div></foreignObject></svg>`;
    ancestor.append(style);
    if (fixture.before) ancestor.insertAdjacentHTML("beforeend", fixture.before);
    ancestor.append(source);
    root.append(ancestor);
    const svg = source.querySelector("svg")!, owners = new Set(svg.querySelectorAll("foreignObject *"));
    const before = ancestor.outerHTML;
    const context = generatedCounterContexts(svg, owners, new Set(["x", "list-item", "absent"]), profile);
    if (ancestor.outerHTML !== before) throw new Error("Counter capture mutated its original host markup.");
    const pseudo = (element: Element, side: "before" | "after") => {
      const css = getComputedStyle(element, `::${side}`);
      if (["none", "normal", ""].includes(css.content) || css.display === "none") return "";
      const values = context.get(element)?.[side];
      const content = side === "before" && fixture.originalBefore && element.classList.contains("g")
        ? fixture.originalBefore
        : css.content;
      const value = generatedQuotedContentValue(
        content,
        css.quotes,
        "en",
        { depth: 0 },
        "chromium-common",
        (name, args) => generatedCounterFunctionValue(name, args, (name) => values?.get(name), new Map(), "chromium"),
      );
      if (!value) throw new Error(`Counter context oracle lacks textual source: ${fixture.name} ${side}`);
      return value.alternative ?? value.text;
    };
    const text = (node: Node): string => {
      if (node.nodeType === 3) return node.textContent ?? "";
      if (node.nodeType !== 1) return "";
      const element = node as Element, css = getComputedStyle(element);
      if (css.display === "none" || css.visibility !== "visible" || css.contentVisibility === "hidden") return "";
      const children = element.localName === "details" && !element.hasAttribute("open")
        ? [element.querySelector(":scope > summary")].filter((node): node is Element => !!node)
        : [...element.childNodes];
      return pseudo(element, "before") + children.map(text).join("") + pseudo(element, "after");
    };
    return {
      id,
      name: fixture.name,
      expected: text(svg.querySelector("foreignObject > div")!),
      ...(fixture.name.startsWith("reversed-")
        ? { reversedSyntaxSupported: CSS.supports("counter-reset", "reversed(x)") }
        : {}),
      ...(fixture.originalBefore ? { originalContent: true as const } : {}),
    };
  });
}
