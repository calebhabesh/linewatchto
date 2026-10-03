import assert from "node:assert/strict";
import { test } from "node:test";
import { suppliedAlertCause } from "../src/app/alert-cause.ts";

test("missing and unknown source causes are omitted from presentation", () => {
  for (const cause of [undefined, null, "", " \n ", "Unknown", " unknown CAUSE ", "UNKNOWN_CAUSE", "unknown_ cause", "Unknown   Cause"]) {
    assert.equal(suppliedAlertCause(cause), null);
  }
});

test("supplied causes are preserved without treating narrative uncertainty as a missing value", () => {
  for (const cause of ["Construction", "Signal Problems", "TTC signal issue", "Unknown equipment fault under investigation"]) {
    assert.equal(suppliedAlertCause(` ${cause} `), cause);
  }
});
