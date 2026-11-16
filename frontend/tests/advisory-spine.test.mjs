import assert from "node:assert/strict";
import { test } from "node:test";
import { advisorySpinePath } from "../src/hooks/useAdvisoryTrunkEnds.ts";

test("advisory spine: one heading is a trunk that curves into it", () => {
  assert.equal(
    advisorySpinePath({ x: 27.5, y: 36 }, [{ x: 57, y: 120 }]),
    "M 27.5 36 V 114 A 6 6 0 0 0 33.5 120 H 57",
  );
});

test("advisory spine: earlier headings branch off the trunk with their own curve", () => {
  assert.equal(
    advisorySpinePath({ x: 27.5, y: 36 }, [{ x: 57, y: 60 }, { x: 57, y: 200 }]),
    "M 27.5 36 V 194 A 6 6 0 0 0 33.5 200 H 57 M 27.5 54 V 54 A 6 6 0 0 0 33.5 60 H 57",
  );
});

test("advisory spine: the curve shrinks to fit a heading close to the badge", () => {
  assert.equal(
    advisorySpinePath({ x: 10, y: 36 }, [{ x: 40, y: 39 }]),
    "M 10 36 V 36 A 3 3 0 0 0 13 39 H 40",
  );
  assert.equal(advisorySpinePath({ x: 10, y: 36 }, []), "");
});
