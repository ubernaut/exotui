// Copyright 2026 the exotui authors. MIT license.

import { assertEquals } from "./deps.ts";
import { measureTerminalTextIntrinsic } from "../src/layout/measurement.ts";
import { textWidth } from "../src/utils/strings.ts";

Deno.test("intrinsic layout measures tabs as TextBox's one-space authoring separators", () => {
  for (const source of ["aa\tbb cc", "aa\t\tbb cc", "\taa\tbb\t", "\t", "a\tb\tc"]) {
    const rendered = source.replaceAll("\t", " ");
    for (const width of [1, 2, 3, 5, 20]) {
      for (const options of [{}, { wrap: false }, { breakWords: false }]) {
        assertEquals(
          measureTerminalTextIntrinsic(source, width, 1, options),
          measureTerminalTextIntrinsic(rendered, width, 1, options),
          JSON.stringify({ source, width, options }),
        );
      }
    }
  }
  assertEquals(measureTerminalTextIntrinsic("aa\tbb cc", 5), { width: 8, height: 2 });
  assertEquals(measureTerminalTextIntrinsic("a\t\tb", 3), { width: 4, height: 2 });
  assertEquals(textWidth("aa\tbb cc"), 7);
  assertEquals(textWidth("\t"), 0);
});

Deno.test("layout's tab policy does not grant other unpainted controls a column", () => {
  for (const control of ["\x07", "\x0b", "\x0c", "\x7f"]) {
    assertEquals(measureTerminalTextIntrinsic(`a${control}b`, 5), { width: 2, height: 1 });
    assertEquals(textWidth(control), 0);
  }
  assertEquals(measureTerminalTextIntrinsic("aa\tbb\r\ncc\tdd", 5), { width: 5, height: 2 });
});
