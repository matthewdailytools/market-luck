import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { shareFixture } from "../fixtures/share-round.js";

// Run only inside the existing isolated GitHub-hosted browser workflow.
export async function runShareAcceptance({
  browser,
  engine,
  base,
  online,
  out,
}) {
  const report = {
    engine,
    provenance: "isolated GitHub-hosted browser",
    online,
    cases: [],
    layouts: [],
    screenshots: [],
    errors: [],
    apiWrites: [],
  };
  const folder = out + "/share";
  await mkdir(folder, { recursive: true });
  const widths = engine === "chromium" ? [320, 390, 768, 1280] : [320, 390];
  const languages = ["zh-CN", "en", "ja"];
  const save = async () =>
    writeFile(
      `${folder}/${engine}-report.json`,
      JSON.stringify(report, null, 2),
    );
  async function withPage(label, route, work) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) =>
      report.errors.push({ label, message: error.message }),
    );
    await context.route("**/api/**", async (intercepted) => {
      if (intercepted.request().method() !== "GET") {
        report.apiWrites.push(intercepted.request().method());
        return intercepted.abort();
      }
      return route ? route(intercepted) : intercepted.continue();
    });
    try {
      await work(page, context);
      report.cases.push({ label, status: "passed" });
    } catch (error) {
      report.errors.push({ label, message: error.message });
    } finally {
      await context.close();
      await save();
    }
  }
  async function layouts(page, label) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      for (const language of languages) {
        await page.locator("#shareLanguage").selectOption(language);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        const metric = await page.evaluate(() => {
          const controls = [
            ...document.querySelectorAll(
              "button:not(:disabled),select,.evidence a,footer a",
            ),
          ].filter((el) => el.getBoundingClientRect().height > 0);
          return {
            width: innerWidth,
            overflow: Math.max(
              0,
              document.documentElement.scrollWidth - innerWidth,
            ),
            minControlHeight: Math.min(
              ...controls.map((el) => el.getBoundingClientRect().height),
            ),
            balls: document.querySelectorAll("#shareNumbers .ball").length,
          };
        });
        report.layouts.push({ label, language, ...metric });
        assert.equal(metric.overflow, 0);
        assert(metric.minControlHeight >= 43.9);
      }
    }
    await page.locator("#shareLanguage").selectOption("zh-CN");
    await page.setViewportSize({ width: 390, height: 844 });
    const name = `${engine}-${label}-390.png`;
    await page.screenshot({
      path: folder + "/" + name,
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(name);
  }
  if (!online) {
    for (const kind of [
      "pending",
      "passed",
      "tampered",
      "replay",
      "wrong-copy",
    ]) {
      const fixture = shareFixture(kind === "wrong-copy" ? "passed" : kind);
      await withPage(
        "controlled-" + kind,
        (route) => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname === "/api/round/" + fixture.round.id)
            return route.fulfill({ json: fixture });
          if (pathname === "/api/proof/" + fixture.round.id) {
            const proof = structuredClone(fixture.round.proof);
            if (kind === "wrong-copy") proof.poolAfter++;
            return route.fulfill({ json: proof });
          }
          return route.fulfill({
            status: 404,
            json: { error: "Controlled unavailable record" },
          });
        },
        async (page) => {
          await page.goto(
            `${base}/share.html?round=${fixture.round.id}&game=de&lang=zh-CN&account=private-value`,
          );
          const success = ["passed", "replay"].includes(kind),
            pending = kind === "pending";
          await expect(page.locator("#sharePhase")).toHaveAttribute(
            "data-phase",
            success ? "passed" : pending ? "sales" : "failed",
          );
          await expect(page.locator("#shareNumbers .ball")).toHaveCount(
            success ? 7 : 0,
          );
          await expect(page.locator("#shareMode")).toHaveAttribute(
            "data-mode",
            kind === "replay" ? "REPLAY" : "DEMO",
          );
          assert(!page.url().includes("private-value"));
          await expect(page.locator("#shareUrl")).not.toHaveValue(
            /private-value/,
          );
          if (success || pending)
            await expect(page.locator("#saveShare")).toBeEnabled();
          else await expect(page.locator("#saveShare")).toBeDisabled();
          await layouts(page, "controlled-" + kind);
          if (kind === "replay")
            await expect(page.locator("#shareNumbers .bonus")).toHaveText("00");
          if (kind === "passed") {
            await page.evaluate(() =>
              Object.defineProperty(navigator, "clipboard", {
                value: undefined,
                configurable: true,
              }),
            );
            await page.locator("#copyShare").click();
            await expect(page.locator("#shareActionStatus")).toContainText(
              "手动复制",
            );
            assert.equal(
              await page.evaluate(() => document.activeElement.id),
              "shareUrl",
            );
            await page.evaluate(() =>
              Object.defineProperty(navigator, "share", {
                value: async () => {
                  throw new DOMException("Cancelled", "AbortError");
                },
                configurable: true,
              }),
            );
            await page.locator("#nativeShare").click();
            await expect(page.locator("#shareActionStatus")).toContainText(
              "已取消",
            );
            const downloadPromise = page.waitForEvent("download");
            await page.locator("#saveShare").click();
            const download = await downloadPromise;
            assert.match(download.suggestedFilename(), /^market-luck-demo-/);
            await download.saveAs(
              `${folder}/${engine}-controlled-demo-card.png`,
            );
            await expect(page.locator("#shareActionStatus")).toContainText(
              "图片已生成",
            );
            await page.locator("#shareGame").selectOption("cn");
            assert.equal(new URL(page.url()).searchParams.get("game"), "cn");
            await page.locator("#shareVerify").click();
            assert.equal(
              new URL(page.url()).searchParams.get("round"),
              fixture.round.id,
            );
          }
        },
      );
    }
    await withPage(
      "invalid-link-and-unavailable-record",
      (route) =>
        route.fulfill({ status: 404, json: { error: "Controlled 404" } }),
      async (page) => {
        for (const query of [
          "round=missing&game=de",
          "round=..%2Fsecret",
          "round=missing&game=unknown",
        ]) {
          await page.goto(base + "/share.html?" + query);
          await expect(page.locator("#shareLoad")).toContainText("无法读取");
          await expect(page.locator("#roundCard")).toBeHidden();
          await expect(page.locator("#copyShare")).toBeDisabled();
          await expect(page.locator("#shareNumbers .ball")).toHaveCount(0);
        }
      },
    );
  }
  for (const origin of online
    ? [base, "https://luck.onlinefreetools.org"]
    : [base]) {
    const label = origin.includes("luck.online")
      ? "online-live-readonly"
      : online
        ? "online-demo-readonly"
        : "local-real-api";
    await withPage(label, null, async (page, context) => {
      const before = await (
        await context.request.get(origin + "/api/state")
      ).json();
      const round =
        before.rounds.find((r) => r.status === "open") || before.rounds[0];
      assert(round);
      await page.goto(origin + "/");
      const homeLink = page.locator("#heroShareLink");
      await expect(homeLink).toBeVisible();
      assert.equal(
        new URL(await homeLink.getAttribute("href"), origin).searchParams.get(
          "round",
        ),
        round.id,
      );
      await expect(page.locator("#trustPillars a")).toHaveCount(3);
      await homeLink.click();
      await expect(page.locator("#roundCard")).toBeVisible();
      assert.equal(new URL(page.url()).searchParams.get("round"), round.id);
      await page.locator("#shareGame").selectOption("de");
      await expect(page.locator("#shareMode")).toHaveAttribute(
        "data-mode",
        before.demo ? "DEMO" : "LIVE",
      );
      if (!round.proof)
        await expect(page.locator("#shareNumbers .ball")).toHaveCount(0);
      if (round.status === "settled")
        await expect(page.locator("#sharePhase")).toHaveAttribute(
          "data-phase",
          "passed",
        );
      await layouts(page, label);
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#saveShare").click();
      const download = await downloadPromise;
      await download.saveAs(`${folder}/${engine}-${label}-card.png`);
      await expect(page.locator("#shareActionStatus")).toContainText(
        "图片已生成",
      );
      const exactUrl = page.url();
      await page.reload();
      await expect(page.locator("#roundCard")).toBeVisible();
      assert.equal(page.url(), exactUrl);
      await expect(page.locator("#shareGame")).toHaveValue("de");
      await page.locator("#shareRules").click();
      assert.equal(new URL(page.url()).searchParams.get("round"), round.id);
      if (!before.demo) {
        const after = await (
          await context.request.get(origin + "/api/state")
        ).json();
        assert.equal(after.pool, before.pool);
        const current = after.rounds.find((r) => r.id === round.id);
        assert.deepEqual(current.manifest, round.manifest);
        assert.equal(current.commitment, round.commitment);
        assert.deepEqual(current.proof, round.proof);
      }
    });
  }
  report.status =
    report.errors.length || report.apiWrites.length ? "failed" : "passed";
  await save();
  return {
    engine,
    status: report.status,
    cases: report.cases.length,
    layoutCases: report.layouts.length,
    errors: report.errors,
    apiWrites: report.apiWrites.length,
  };
}
