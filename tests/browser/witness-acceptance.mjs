import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { beaconTime } from "../../src/beacon.js";
export async function runWitnessAcceptance({ browser, engine, base, out }) {
  const proof = JSON.parse(
    await readFile(
      new URL("../fixtures/v3-controlled-proof.json", import.meta.url),
      "utf8",
    ),
  );
  const report = {
    engine,
    provenance:
      "controlled expedited market calendar and synthetic prices; genuine independent Rekor signatures and genuine future drand beacon; not a natural draw",
    cases: [],
    layouts: [],
    errors: [],
  };
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  let phase = "pending";
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname,
      p = structuredClone(proof);
    if (phase === "tampered") p.witnesses.freeze.entry.integratedTime++;
    const round = {
      id: p.manifest.id,
      manifest: p.manifest,
      commitment: p.commitment,
      cutoff: p.manifest.cutoff,
      ready: p.manifest.ready,
      status: phase === "pending" ? "open" : "settled",
      proof: phase === "pending" ? null : p,
    };
    if (path === "/api/state")
      return route.fulfill({
        json: {
          serverTime: Date.now(),
          demo: false,
          games: p.manifest.games,
          rounds: [round],
          anchors: [],
          attempts: [],
          pool: 100000,
          me: null,
          tickets: [],
          winners: [],
          ledger: [],
        },
      });
    if (path === "/api/round/" + round.id)
      return route.fulfill({
        json: {
          serverTime: Date.now(),
          demo: false,
          round,
          anchor: null,
          attempts: [],
        },
      });
    if (path === "/api/round/" + round.id + "/entropy")
      return route.fulfill({
        json: {
          roundId: round.id,
          version: 3,
          snapshot: phase === "pending" ? null : p.snapshot,
          beaconTime:
            phase === "pending" ? null : beaconTime(p.snapshot.beaconRound),
        },
      });
    if (path === "/api/round/" + round.id + "/witnesses")
      return route.fulfill({
        json: {
          roundId: round.id,
          version: 3,
          commitment: p.commitment,
          witnesses:
            phase === "pending"
              ? { presale: p.witnesses.presale }
              : p.witnesses,
          reveal: phase === "pending" ? null : p.reveal,
        },
      });
    if (path === "/api/proof/" + round.id && phase !== "pending")
      return route.fulfill({ json: p });
    return route.fulfill({
      status: 404,
      json: { error: "Controlled unavailable record" },
    });
  });
  try {
    await page.goto(base + "/verify.html?round=" + proof.manifest.id, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("#entropyPanel")).toContainText(
      proof.manifest.hidden.sha256,
    );
    await expect(page.locator("#entropyPanel")).toContainText(
      "签名与包含证明通过",
    );
    assert(
      !(await page.locator("body").innerText()).includes(
        JSON.parse(proof.reveal).nonce,
      ),
    );
    await expect(
      page.locator('#entropyPanel a[href*="rekor.sigstore.dev"]'),
    ).toHaveCount(1);
    report.cases.push(
      "pending committed round displays verified presale witness but no secret order or nonce",
    );
    phase = "settled";
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".check-item.pass")).toHaveCount(11);
    await expect(page.locator("#entropyPanel")).toContainText(
      JSON.parse(proof.reveal).nonce,
    );
    await expect(
      page.locator('#entropyPanel a[href*="rekor.sigstore.dev"]'),
    ).toHaveCount(2);
    for (const width of [320, 390, 1280])
      for (const language of ["zh-CN", "en", "ja"]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator("#verifyLanguage").selectOption(language);
        await expect(page.locator(".check-item.pass")).toHaveCount(11);
        await expect(page.locator("#entropyPanel")).toContainText(
          JSON.parse(proof.reveal).nonce,
        );
        const overflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - innerWidth),
        );
        assert.equal(overflow, 0);
        report.layouts.push({ width, language, overflow });
      }
    await page.locator("#verifyLanguage").selectOption("zh-CN");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#entropyPanel")).toContainText(
      JSON.parse(proof.reveal).nonce,
    );
    await page
      .locator("#entropyPanel")
      .screenshot({
        path: `${out}/screenshots/${engine}-v3-witness-controlled.png`,
      });
    report.cases.push(
      "eleven checks pass with genuine independent receipts and revealed hidden package across three languages",
    );
    phase = "tampered";
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".check-item.fail")).not.toHaveCount(0);
    await expect(page.locator("#entropyPanel")).toContainText("记录校验失败");
    report.cases.push("tampering independent signed time is rejected");
    await page.goto(
      base + "/share.html?round=" + proof.manifest.id + "&game=de&lang=zh-CN",
      { waitUntil: "networkidle" },
    );
    await expect(page.locator("#sharePhase")).toHaveAttribute(
      "data-phase",
      "failed",
    );
    await expect(page.locator("#shareNumbers .ball")).toHaveCount(0);
    await expect(page.locator("#saveShare")).toBeDisabled();
    report.cases.push(
      "invalid witness blocks public numbers and result-image export",
    );
  } catch (error) {
    report.errors.push(error.message);
  } finally {
    await context.close();
  }
  report.status = report.errors.length ? "failed" : "passed";
  await writeFile(
    `${out}/${engine}-witness-report.json`,
    JSON.stringify(report, null, 2),
  );
  return report;
}
