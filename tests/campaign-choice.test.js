import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAMPAIGN, resolveCampaign } from "../public/campaigns.js";

test("a fresh visitor or two invalid choices get the evaluated points default", () => {
  assert.equal(DEFAULT_CAMPAIGN, "points");
  assert.equal(resolveCampaign(), "points");
  for (const value of [null, "", "unknown", "POINTS", {}, "__proto__"])
    assert.equal(resolveCampaign(value, value), "points");
});

test("an explicit valid theme wins over a previously saved preference", () => {
  for (const requested of ["verify", "points", "world"])
    for (const saved of ["verify", "points", "world"])
      assert.equal(resolveCampaign(requested, saved), requested);
});

test("a missing or invalid URL choice preserves the visitor's valid saved theme", () => {
  for (const saved of ["verify", "points", "world"]) {
    assert.equal(resolveCampaign(undefined, saved), saved);
    assert.equal(resolveCampaign("not-a-theme", saved), saved);
  }
});
