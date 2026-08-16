// Copyright 2023 Im-Beast. MIT license.

// NAV-003: nested route trees and named outlets — parent lifecycle persists
// across child replacement, exits are child-first, and outlet focus order is
// deterministic.

import { assertEquals } from "./deps.ts";
import { createRouteOutletTree } from "../mod.ts";

function tree() {
  return createRouteOutletTree([
    {
      id: "users",
      segment: "users",
      children: [
        {
          id: "user",
          segment: ":id",
          children: [
            { id: "profile", segment: "profile" },
            { id: "posts", segment: "posts", outlet: "detail" },
          ],
        },
      ],
    },
    { id: "nav", segment: "nav", outlet: "sidebar" },
  ]);
}

Deno.test("nested matching binds parameters and literal segments win over params", () => {
  const routes = tree();
  const match = routes.match("/users/42/profile")!;
  assertEquals(match.chain.map((node) => node.id), ["users", "user", "profile"]);
  assertEquals(match.params, { id: "42" });
  assertEquals(routes.match("/users/42/missing"), undefined);
  assertEquals(routes.match("/nowhere"), undefined);
});

Deno.test("child replacement retains the parent chain; exits are child-first", () => {
  const routes = tree();
  const first = routes.activate("/users/42/profile")!;
  assertEquals(first.entered, ["users", "user", "profile"]);
  assertEquals(first.exited, []);

  // Same parent, different leaf: only the leaf cycles.
  const second = routes.activate("/users/42/posts")!;
  assertEquals(second.retained, ["users", "user"]);
  assertEquals(second.exited, ["profile"]);
  assertEquals(second.entered, ["posts"]);

  // Different user id matches the SAME :id node: the node is retained even
  // though the parameter changed - parameter changes are data, not lifecycle.
  const third = routes.activate("/users/7/posts")!;
  assertEquals(third.retained, ["users", "user", "posts"]);
  assertEquals(third.params, { id: "7" });

  // Leaving the subtree tears down child-first.
  const fourth = routes.activate("/nav")!;
  assertEquals(fourth.exited, ["posts", "user", "users"]);
  assertEquals(fourth.entered, ["nav"]);
});

Deno.test("named outlets assign deterministically and focus order is stable", () => {
  const routes = tree();
  const detail = routes.activate("/users/42/posts")!;
  assertEquals(detail.outlets, { main: "user", detail: "posts" });
  assertEquals(detail.focusOrder, ["main", "detail"]);

  // Replacing the child with a main-outlet leaf drops the detail outlet.
  const profile = routes.activate("/users/42/profile")!;
  assertEquals(profile.outlets, { main: "profile" });
  assertEquals(profile.focusOrder, ["main"]);
});
