import test from "node:test";
import assert from "node:assert/strict";
import { parseDesktopServiceSheetPosition as parse } from "../src/app/desktop-service-sheet-state.ts";

test("restores expanded, collapsed and intermediate sheet positions", () => {
  for (const value of [{ expanded: false, height: null }, { expanded: true, height: null }, { expanded: true, height: 275 }]) {
    assert.deepEqual(parse(JSON.stringify(value)), value);
  }
  assert.deepEqual(parse('{"expanded":false,"height":275}'), { expanded: false, height: null });
});

test("ignores malformed saved positions", () => {
  for (const raw of [null, "bad", "null", "{}", '{"expanded":"true","height":200}', '{"expanded":true,"height":-1}', '{"expanded":true,"height":"250"}']) {
    assert.equal(parse(raw), null);
  }
});
