import { assert, assertEquals } from "./deps.ts";
import { createMotionContext } from "../src/theme_motion.ts";
import {
  createSurfaceTransitionAnimator,
  DEFAULT_SURFACE_TRANSITION_SETTINGS,
  SURFACE_TRANSITION_BASE_DURATION_MS,
  surfaceTransitionMotionToken,
} from "../src/app/surface_transitions.ts";

const SNAPSHOT = ["┌──┐", "│AB│", "└──┘"];
const RECT = { column: 4, row: 2, width: 4, height: 3 };

Deno.test("surface transition animator plays a close overlay to completion", () => {
  const animator = createSurfaceTransitionAnimator({ seed: 11 });
  const started = animator.begin({
    surfaceId: "w1",
    transition: "close",
    rect: RECT,
    snapshot: SNAPSHOT,
    now: 1_000,
  });
  assertEquals(started, true);
  assertEquals(animator.animating(), true);

  const mid = animator.framesAt(1_100);
  assertEquals(mid.length, 1);
  assertEquals(mid[0]!.surfaceId, "w1");
  assertEquals(mid[0]!.rect, RECT);
  assertEquals(mid[0]!.frame.done, false);

  const end = animator.framesAt(1_000 + 320 * 2);
  assertEquals(end.length, 1);
  assertEquals(end[0]!.frame.done, true);
  assertEquals(animator.animating(), false);
  assertEquals(animator.framesAt(2_000), []);
});

Deno.test("speed off and unset transition kinds animate nothing", () => {
  const animator = createSurfaceTransitionAnimator({
    settings: { speed: "off", kinds: { close: "fade" } },
  });
  assertEquals(
    animator.begin({ surfaceId: "w", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 }),
    false,
  );

  const noKind = createSurfaceTransitionAnimator({
    settings: { speed: "normal", kinds: {} },
  });
  assertEquals(
    noKind.begin({ surfaceId: "w", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 }),
    false,
  );
  assertEquals(noKind.animating(), false);
});

Deno.test("reduced motion collapses nonessential surface transitions to instant", () => {
  const motion = createMotionContext({ reducedMotion: true });
  motion.declare(surfaceTransitionMotionToken("close"), {
    durationMs: 320,
    easing: "ease-in",
    staticBehavior: "jump-to-end",
  });
  const animator = createSurfaceTransitionAnimator({ motion });
  assertEquals(
    animator.begin({ surfaceId: "w", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 }),
    false,
  );

  motion.setReducedMotion(false);
  assertEquals(
    animator.begin({ surfaceId: "w", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 }),
    true,
  );
});

Deno.test("a new transition on the same surface replaces the playing one", () => {
  const animator = createSurfaceTransitionAnimator();
  animator.begin({ surfaceId: "w", transition: "minimize", rect: RECT, snapshot: SNAPSHOT, now: 0 });
  animator.begin({ surfaceId: "w", transition: "restore", rect: RECT, snapshot: SNAPSHOT, now: 50 });
  const overlays = animator.framesAt(60);
  assertEquals(overlays.length, 1);
  assertEquals(overlays[0]!.transition, "restore");
});

Deno.test("cancel drops overlays without waiting for completion", () => {
  const animator = createSurfaceTransitionAnimator();
  animator.begin({ surfaceId: "a", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 });
  animator.begin({ surfaceId: "b", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 });
  animator.cancel("a");
  assertEquals(animator.framesAt(10).map((overlay) => overlay.surfaceId), ["b"]);
  animator.cancelAll();
  assertEquals(animator.animating(), false);
});

Deno.test("speed scales the duration and defaults cover every transition", () => {
  for (
    const transition of ["open", "close", "minimize", "maximize", "restore"] as const
  ) {
    assert(DEFAULT_SURFACE_TRANSITION_SETTINGS.kinds[transition], `${transition} has a default kind`);
  }

  const slow = createSurfaceTransitionAnimator({
    settings: { speed: "slow", kinds: { close: "fade" } },
  });
  slow.begin({ surfaceId: "w", transition: "close", rect: RECT, snapshot: SNAPSHOT, now: 0 });
  // At the base duration a slow animation is only halfway.
  const base = SURFACE_TRANSITION_BASE_DURATION_MS.close;
  assertEquals(slow.framesAt(base)[0]!.frame.done, false);
  assertEquals(slow.framesAt(base * 2)[0]!.frame.done, true);
});
