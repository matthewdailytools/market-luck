import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeRoundShare,
  roundSharePath,
} from "../public/round-share-model.js";
import { verifyProof } from "../public/proof-verifier.js";
import { shareFixture } from "./fixtures/share-round.js";

async function model(kind, language = "zh-CN", game = "de") {
  const data = shareFixture(kind);
  const verification = data.round.proof
    ? await verifyProof(data.round.proof, {
        roundId: data.round.id,
        commitment: data.round.commitment,
        manifest: data.round.manifest,
      })
    : null;
  return {
    data,
    verification,
    view: describeRoundShare(
      data,
      game,
      language,
      data.serverTime,
      verification,
    ),
  };
}
test("a published result is withheld until independent recalculation passes, including tampered numbers", async () => {
  const { data, view, verification } = await model("passed");
  assert.equal(verification.ok, true);
  assert.equal(view.phase, "passed");
  assert.deepEqual(view.main, data.round.proof.results.de.main);
  const checking = describeRoundShare(data, "de", "zh-CN", data.serverTime);
  assert.equal(checking.phase, "checking");
  assert.deepEqual(checking.main, []);
  assert.equal(checking.canExport, false);
  const broken = await model("tampered");
  assert.equal(broken.verification.ok, false);
  assert.equal(broken.view.phase, "failed");
  assert.deepEqual(broken.view.main, []);
  assert.equal(broken.view.canExport, false);
});
test("LIVE, DEMO and replay remain distinct even when all consistency checks pass", async () => {
  for (const [kind, mode] of [
    ["live", "LIVE"],
    ["passed", "DEMO"],
    ["replay", "REPLAY"],
  ]) {
    const result = await model(kind);
    assert.equal(result.verification.ok, true);
    assert.equal(result.view.mode, mode);
    assert.match(result.view.modeLabel, new RegExp(mode));
    assert.equal(result.view.phase, "passed");
    if (kind === "replay") assert.equal(result.view.bonus, 0);
  }
});
test("pending, paused and source-waiting rounds never reveal numbers or infer a guaranteed draw", () => {
  const data = shareFixture("pending");
  for (const now of [
    data.serverTime,
    data.round.cutoff,
    data.round.ready,
    data.round.ready + 1,
  ]) {
    const view = describeRoundShare(data, "cn", "zh-CN", now);
    assert.deepEqual(view.main, []);
    assert.equal(view.bonus, null);
    assert.notEqual(view.phase, "passed");
    assert.match(view.message, /不.*保证|不是保证/);
  }
  const paused = shareFixture("paused");
  assert.equal(
    describeRoundShare(paused, "cn", "zh-CN", paused.serverTime).phase,
    "paused",
  );
});
test("round/format mismatches and mutated stored timing never silently substitute another result", () => {
  for (const mutate of [
    (d) => (d.round.manifest.id = "wrong"),
    (d) => (d.round.status = "draft"),
    (d) => d.round.cutoff++,
    (d) => d.round.ready++,
    (d) => (d.round.id = "../secret"),
  ]) {
    const data = shareFixture("pending");
    mutate(data);
    assert.equal(
      describeRoundShare(data, "cn", "zh-CN", data.serverTime),
      null,
    );
  }
  const data = shareFixture("pending");
  assert.equal(
    describeRoundShare(data, "unknown", "zh-CN", data.serverTime),
    null,
  );
});
test("all language links are bound to public round and format, and never serialize private data", async () => {
  for (const language of ["zh-CN", "en", "ja"]) {
    const { data, verification } = await model("passed", language);
    data.me = { name: "private-account", balance: 123456 };
    data.tickets = [{ id: "secret-ticket" }];
    const view = describeRoundShare(
      data,
      "de",
      language,
      data.serverTime,
      verification,
    );
    assert.equal(view.language, language);
    assert.match(view.path, /game=de/);
    assert.equal(
      new URL(view.path, "https://example.org").searchParams.get("round"),
      data.round.id,
    );
    assert.doesNotMatch(
      JSON.stringify(view),
      /private-account|123456|secret-ticket/,
    );
  }
  assert.equal(roundSharePath("../x"), null);
  assert.equal(roundSharePath("valid", "<script>"), null);
});
