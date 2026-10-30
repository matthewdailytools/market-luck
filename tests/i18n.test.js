import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { translate } from "../public/i18n.js";
test("selection rules translate without corrupting full phrases or Germany zero", () => {
  const source = "主球选 6 个（1–49） + 特别球 1 个（0–9） · 虚拟规则";
  assert.equal(
    translate(source, "en"),
    "Pick 6 main balls (1–49) + 1 special ball (0–9) · Virtual rules",
  );
  const ja = translate(source, "ja");
  assert(ja.includes("0–9"));
  assert(!/[选个虚拟]/.test(ja));
  assert.equal(translate("主球", "en"), "Main ball");
});
test("the shipped payout paragraph has a complete English translation after HTML wrapping", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = html.match(/<details>.*?<p>(.*?)<\/p>/s)[1];
  const en = translate(source, "en");
  assert(!/[\u3400-\u9fff]/.test(en));
  assert(en.includes("50% / 30% / 20%"));
  assert(en.includes("trust boundaries"));
});
