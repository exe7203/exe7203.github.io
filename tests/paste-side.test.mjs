import assert from "node:assert/strict";
import test from "node:test";
import {
  PASTE_SIDE_STORAGE_KEY,
  readPasteSidePreference,
} from "../app/lib/paste-side.ts";

test("paste-side preference defaults safely and accepts only the left value", () => {
  assert.equal(PASTE_SIDE_STORAGE_KEY, "quicknav-paste-side-v1");
  assert.equal(readPasteSidePreference("left"), "left");
  assert.equal(readPasteSidePreference("right"), "right");
  assert.equal(readPasteSidePreference(null), "right");
  assert.equal(readPasteSidePreference("invalid"), "right");
  assert.equal(readPasteSidePreference("LEFT"), "right");
});
