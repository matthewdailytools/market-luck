import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPublication } from "../src/publication.js";
import { hash } from "../src/engine.js";
const url =
  "https://raw.githubusercontent.com/matthewdailytools/market-luck/" +
  "a".repeat(40) +
  "/commitments/example.json";
test("publication requires exact committed bytes and Workers-compatible no-redirect policy", async () => {
  await verifyPublication(url, hash("{}"), undefined, async (u, options) => {
    assert.equal(options.redirect, "manual");
    return new Response("{}");
  });
  await assert.rejects(
    verifyPublication(
      url,
      hash("{}"),
      undefined,
      async () => new Response("{}", { status: 302 }),
    ),
    /NOT_AVAILABLE/,
  );
  await assert.rejects(
    verifyPublication(
      url,
      hash("{}"),
      undefined,
      async () => new Response("{ }"),
    ),
    /HASH_MISMATCH/,
  );
});
test("mutable branches, alternate hosts and credentials cannot anchor sales", async () => {
  for (const u of [
    url.replace("a".repeat(40), "main"),
    url.replace("raw.githubusercontent.com", "evil.invalid"),
    url + "?x=1",
  ])
    await assert.rejects(verifyPublication(u, hash("{}")), /URL_REQUIRED/);
});
