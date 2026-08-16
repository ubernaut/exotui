// Copyright 2023 Im-Beast. MIT license.

// WID-009: rejected moves return cards to stable positions without
// losing focus.

import { assert, assertEquals } from "./deps.ts";
import { createKanbanController } from "../mod.ts";

function board() {
  const kanban = createKanbanController({
    columns: [
      { id: "todo", title: "To do" },
      { id: "doing", title: "Doing", wipLimit: 2 },
      { id: "done", title: "Done" },
    ],
    lanes: ["team-a", "team-b"],
  });
  kanban.addCard({ id: "c1", title: "one" }, "todo", "team-a");
  kanban.addCard({ id: "c2", title: "two" }, "todo", "team-a");
  kanban.addCard({ id: "c3", title: "three" }, "todo", "team-a");
  kanban.addCard({ id: "c4", title: "four" }, "doing", "team-b");
  return kanban;
}

Deno.test("optimistic moves apply immediately and commit cleanly", () => {
  const kanban = board();
  const move = kanban.moveCard("c2", { columnId: "doing", laneId: "team-a", index: 0 });
  assert(move.ok);
  // Applied before any confirmation.
  assertEquals(kanban.positionOf("c2"), { columnId: "doing", laneId: "team-a", index: 0 });
  move.handle.commit();
  assertEquals(kanban.window("todo", "team-a").map((card) => card.id), ["c1", "c3"]);
});

Deno.test("rejected moves restore the exact position and keep focus", () => {
  const kanban = board();
  kanban.focusCard("c2");
  const move = kanban.moveCard("c2", { columnId: "done", laneId: "team-b" });
  assert(move.ok);
  assertEquals(kanban.positionOf("c2")!.columnId, "done"); // optimistic

  move.handle.reject(); // the server said no
  // EXACT previous position: same column, lane, and middle index.
  assertEquals(kanban.positionOf("c2"), { columnId: "todo", laneId: "team-a", index: 1 });
  assertEquals(kanban.window("todo", "team-a").map((card) => card.id), ["c1", "c2", "c3"]);
  assertEquals(kanban.focusedCard(), "c2"); // focus never lost
  move.handle.reject(); // idempotent
  assertEquals(kanban.window("todo", "team-a").length, 3);
});

Deno.test("WIP limits refuse before optimism; swimlanes count together", () => {
  const kanban = board();
  assert(kanban.moveCard("c1", { columnId: "doing", laneId: "team-a" }).ok); // load 2 = limit
  const over = kanban.moveCard("c2", { columnId: "doing", laneId: "team-a" });
  assert(!over.ok && over.reason.includes("WIP limit of 2"));
  assertEquals(kanban.positionOf("c2")!.columnId, "todo"); // never moved
  // Reordering WITHIN the full column is still allowed.
  assert(kanban.moveCard("c4", { columnId: "doing", laneId: "team-a", index: 0 }).ok);
});

Deno.test("keyboard movement drives the same optimistic path", () => {
  const kanban = board();
  kanban.focusCard("c3");
  const right = kanban.moveFocusedCard("right");
  assert(right.ok);
  assertEquals(kanban.positionOf("c3")!.columnId, "doing");
  right.handle.reject();
  assertEquals(kanban.positionOf("c3"), { columnId: "todo", laneId: "team-a", index: 2 });
  assertEquals(kanban.focusedCard(), "c3");

  kanban.focusCard("c1");
  const off = kanban.moveFocusedCard("left");
  assert(!off.ok && off.reason.includes("no column"));
});
