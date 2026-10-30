import { test } from "node:test";
import assert from "node:assert/strict";
import {
  games,
  hash,
  draw,
  tier,
  validate,
  canonical,
  evidence,
} from "../src/engine.js";
test("determinism, range and uniqueness for all games", () => {
  for (const g of games)
    for (let i = 0; i < 300; i++) {
      const r = draw(hash("seed" + i), g);
      assert.deepEqual(r, draw(hash("seed" + i), g));
      assert.equal(new Set(r.main).size, g.count);
      assert(r.main.every((n) => n >= 1 && n <= g.max));
      validate(g.id, r.main, r.bonus);
      assert.equal(tier(r, r), 1);
    }
});
test("reject duplicates, decimals and invalid bonus", () => {
  assert.throws(() => validate("cn", [1, 1, 2, 3, 4, 5], 1));
  assert.throws(() => validate("uk", [1, 2, 3, 4, 5, 6], 1));
  assert.throws(() => validate("us", [1, 2, 3, 4, 5.5], 2));
});
test("16 distinct countries, Germany zero and country-specific lower tiers", () => {
  assert.equal(games.length, 16);
  assert.equal(new Set(games.map((g) => g.id)).size, 16);
  validate("de", [1, 2, 3, 4, 5, 6], 0);
  assert.throws(() => validate("de", [1, 2, 3, 4, 5, 6], 10));
  const result = { main: [1, 2, 3, 4, 5, 6], bonus: null };
  const ticket = { main: [1, 2, 10, 11, 12, 13], bonus: null };
  assert.equal(
    tier(
      ticket,
      result,
      games.find((g) => g.id === "it"),
    ),
    3,
  );
  assert.equal(
    tier(
      ticket,
      result,
      games.find((g) => g.id === "br"),
    ),
    0,
  );
});
test("old manifest retains its own game catalog", () => {
  const r = {
    id: "old",
    commitment: "c",
    manifest: JSON.stringify({ games: games.slice(0, 4) }),
  };
  assert.deepEqual(Object.keys(evidence(r, []).results), [
    "cn",
    "us",
    "uk",
    "jp",
  ]);
  assert.throws(() => validate("fr", [1, 2, 3, 4, 5], 1, games.slice(0, 4)));
});
test("canonical sorting and hash proof", () => {
  const p = [
    {
      symbol: "Z:A",
      date: "2026-10-30",
      currency: "USD",
      scale: 2,
      close: 100,
    },
    {
      symbol: "A:B",
      date: "2026-10-30",
      currency: "USD",
      scale: 2,
      close: 200,
    },
  ];
  assert.equal(canonical("a", "c", p), canonical("a", "c", p.reverse()));
  const r = { id: "a", manifest: "{}", commitment: "c" },
    e = evidence(r, p);
  assert.equal(e.seed, hash(e.input));
  assert.equal(e.md5.length, 32);
});
