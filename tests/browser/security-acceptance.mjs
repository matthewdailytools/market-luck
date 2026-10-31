import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { v2ProofFixture } from "../fixtures/v2-proof.js";
import { beaconTime } from "../../src/beacon.js";

export async function runSecurityAcceptance({ browser, engine, base, out }) {
  const report = {
    engine,
    provenance:
      "controlled v2 market fixture, official historical beacon, simulated replay clock",
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
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  let corrupt = false;
  const proof = v2ProofFixture();
  const round = {
    id: proof.manifest.id,
    manifest: proof.manifest,
    commitment: proof.commitment,
    cutoff: proof.manifest.cutoff,
    ready: proof.manifest.ready,
    status: "settled",
    proof,
  };
  const detail = {
    serverTime: Date.now(),
    demo: false,
    round,
    anchor: null,
    attempts: [],
  };
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname;
    const value = structuredClone(proof);
    if (corrupt) value.beacon.randomness = "0".repeat(64);
    if (path === "/api/state")
      return route.fulfill({
        json: {
          serverTime: Date.now(),
          demo: false,
          games: proof.manifest.games,
          rounds: [{ ...round, proof: value }],
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
        json: { ...detail, round: { ...round, proof: value } },
      });
    if (path === "/api/round/" + round.id + "/entropy")
      return route.fulfill({
        json: {
          roundId: round.id,
          version: 2,
          snapshot: proof.snapshot,
          beaconTime: beaconTime(proof.snapshot.beaconRound),
        },
      });
    if (path === "/api/proof/" + round.id)
      return route.fulfill({ json: value });
    return route.fulfill({
      status: 404,
      json: { error: "Controlled unavailable record" },
    });
  });
  try {
    await page.goto(base + "/verify.html?round=" + round.id, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".check-item.pass")).toHaveCount(9);
    await expect(page.locator("#entropyPanel")).toContainText(
      String(proof.snapshot.beaconRound),
    );
    for (const width of [320, 390, 1280])
      for (const language of ["zh-CN", "en", "ja"]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator("#verifyLanguage").selectOption(language);
        await expect(page.locator(".check-item.pass")).toHaveCount(9);
        const overflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - innerWidth),
        );
        assert.equal(overflow, 0);
        report.layouts.push({ width, language, overflow });
      }
    await page.locator("#verifyLanguage").selectOption("zh-CN");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#entropyPanel")).toContainText(
      String(proof.snapshot.beaconRound),
    );
    await page.locator("#entropyPanel").screenshot({
      path: `${out}/screenshots/${engine}-v2-entropy-controlled.png`,
    });
    report.cases.push(
      "valid v2 snapshot, target and BLS proof across three languages",
    );
    corrupt = true;
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".check-item.fail")).not.toHaveCount(0);
    report.cases.push("tampered beacon fails verification");
    await page.goto(
      base + "/share.html?round=" + round.id + "&game=de&lang=zh-CN",
    );
    await expect(page.locator("#sharePhase")).toHaveAttribute(
      "data-phase",
      "failed",
    );
    await expect(page.locator("#shareNumbers .ball")).toHaveCount(0);
    await expect(page.locator("#saveShare")).toBeDisabled();
    report.cases.push("invalid v2 proof cannot export numbers");
  } catch (e) {
    report.errors.push(e.message);
  } finally {
    await context.close();
  }
  report.status = report.errors.length ? "failed" : "passed";
  await writeFile(
    `${out}/${engine}-security-report.json`,
    JSON.stringify(report, null, 2),
  );
  return report;
}
