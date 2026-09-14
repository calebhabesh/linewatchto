import { test } from "node:test";
import assert from "node:assert/strict";
import { availableFilterOptions } from "../src/app/filter-options.ts";
test("result menus hide empty alternatives but retain All and selected empty values", () => {
 const options = [{ value: "all", count: 0 }, { value: "one", count: 0 }, { value: "two", count: 0 }, { value: "three", count: 2 }];
 assert.deepEqual(availableFilterOptions(options, "two").map(option => option.value), ["all", "two", "three"]);
});
test("loading counts and sort choices remain available", () => {
 const options = [{ value: "updated" }, { value: "location" }];
 assert.deepEqual(availableFilterOptions(options, "updated"), options);
 assert.equal(availableFilterOptions([{ value: "any", count: 0 }], "none", "any").length, 1);
});
