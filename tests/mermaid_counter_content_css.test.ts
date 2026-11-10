// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import {
  preserveCounterContentForCSSOM,
  projectCounterContentDeclarations,
} from "../src/content/mermaid_counter_content_css.ts";

const property = "--exotui-counter-content-1";
const project = (source: string) => projectCounterContentDeclarations(source, property, () => true);

Deno.test("counter content projection preserves original plural tokens while leaving other properties intact", () => {
  assertEquals(
    project('.g::before{color:red;content:counters(x,"") ":"!important;counter-increment:x}'),
    `.g::before{color:red;${property}:counters(x,"") ":"!important;counter-increment:x}`,
  );
  assertEquals(
    project('.g { CONTENT /*gap*/ : counter(x) ; content:"" }'),
    `.g { ${property} /*gap*/ : counter(x) ; ${property}:"" }`,
  );
});

Deno.test("upstream CSSOM protection keeps empty plural functions, per-declaration variables and original importance", () => {
  const result = preserveCounterContentForCSSOM(
    '.g::before{content:counters(x,"") ":"!important;content:counter(x)}.g::after{content:counters(x,"")}',
    (value) => ({ valid: true, important: value.includes("!important") }),
  );
  const variables = [...result.matchAll(/content:var\((--exotui-preserved-counter-\d+-\d+)\)/g)].map((match) =>
    match[1]!
  );
  assertEquals(variables.length, 2);
  assertEquals(variables[0] === variables[1], false);
  assertEquals(
    result.includes(`content:var(${variables[0]})!important;${variables[0]}:counters(x,"") ":"!important`),
    true,
  );
  assertEquals(result.includes(`content:var(${variables[1]});${variables[1]}:counters(x,"")`), true);
  assertEquals(result.includes("content:counter(x)"), true);
  const inert = '/*counters(x,"")*/.g{content:"counters(x,empty)";color:red}';
  assertEquals(preserveCounterContentForCSSOM(inert, () => ({ valid: true, important: false })), inert);
  const unrelated = String.raw`.g{CoNTENT:"text";\63 ontent:counter(x)}`;
  assertEquals(preserveCounterContentForCSSOM(unrelated, () => ({ valid: true, important: false })), unrelated);
  assertEquals(
    preserveCounterContentForCSSOM('.g{content:counters(x,"") invalid}', () => ({ valid: false, important: false })),
    '.g{content:counters(x,"") invalid}',
  );
});

Deno.test("counter content projection does not rewrite CSS strings, comments, selectors or custom-property bodies", () => {
  const untouched =
    `/*content:counter(x)*/content:hover{--payload:{content:counters(x,"");};font-family:"content:counter(x)";background:url("content:counter(x)");}`;
  assertEquals(project(untouched), untouched);
  assertEquals(
    project(`.g{content:hover{color:red}& content:hover{content:"yes"}}`),
    `.g{content:hover{color:red}& content:hover{${property}:"yes"}}`,
  );
  assertEquals(
    project('.g[data-value="{content:counter(x)}"]{content:"content:counter(x)"}'),
    `.g[data-value="{content:counter(x)}"]{${property}:"content:counter(x)"}`,
  );
});

Deno.test("counter content projection handles escaped declaration names and keeps balanced function and fallback tokens", () => {
  assertEquals(
    project(String.raw`.g{\63 ontent:counters(x, "\22 ,\22 ")}`),
    `.g{${property}:counters(x, "\\22 ,\\22 ")}`,
  );
  assertEquals(
    project('.g{content:var(--content, counters(x,""));color:rgb(1,2,3)}'),
    `.g{${property}:var(--content, counters(x,""));color:rgb(1,2,3)}`,
  );
  assertEquals(
    project('.g{--content:var(--missing,{content:"fake"});content:var(--content)}'),
    `.g{--content:var(--missing,{content:"fake"});${property}:var(--content)}`,
  );
});

Deno.test("counter content projection follows conditional and nested declaration contexts, not at-rule preludes", () => {
  const source =
    '@supports(content:counter(x)){@media(width>1px){.g{content:counters(x,"")}}}.g{@media(width>1px){content:"inner"}&::before{content:counter(x)}}';
  assertEquals(
    project(source),
    `@supports(content:counter(x)){@media(width>1px){.g{${property}:counters(x,"")}}}.g{@media(width>1px){${property}:"inner"}&::before{${property}:counter(x)}}`,
  );
});

Deno.test("counter content projection lets the actual host reject invalid fallback declarations without losing earlier valid text", () => {
  assertEquals(
    projectCounterContentDeclarations(
      '.g{content:counters(x,"");content:invalid}',
      property,
      (value) => value.trim() !== "invalid",
    ),
    `.g{${property}:counters(x,"");${property}-ignored:invalid}`,
  );
});

Deno.test("counter stylesheet source, nesting, declaration work and owned names are bounded with fresh recovery", () => {
  assertThrows(() => project(" ".repeat(1_048_577)), RangeError);
  assertThrows(() => project(".g{".repeat(128) + "}".repeat(128)), RangeError);
  assertThrows(() => project(".g{" + "content:counter(x);".repeat(8193) + "}"), RangeError);
  assertThrows(() => project(".g{content:" + "(".repeat(129) + "x" + ")".repeat(129) + "}"), RangeError);
  assertThrows(() => projectCounterContentDeclarations("", "--external", () => true), TypeError);
  assertEquals(project('.g{content:"okay"}'), `.g{${property}:"okay"}`);
});
