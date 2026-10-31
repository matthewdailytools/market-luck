import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
export async function runBrandArchiveAcceptance({
  browser,
  engine,
  base,
  out,
}) {
  const report = { engine, cases: [], layouts: [], errors: [] };
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: "zh-CN",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  const names = { "zh-CN": "公开奖", en: "OpenDraw", ja: "公開くじ" };
  try {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toHaveAttribute(
      "data-campaign",
      "verify",
    );
    await expect(page.locator("#campaignTitle")).toContainText("规则先承诺");
    await expect(
      page.locator('#campaignEvidenceCards a[href*="/history"]'),
    ).toHaveCount(1);
    for (const width of [320, 390, 1280])
      for (const language of ["zh-CN", "en", "ja"]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator("#language").selectOption(language);
        await expect(page.locator("[data-brand-name]")).toHaveText(
          names[language],
        );
        await expect(page).toHaveTitle(new RegExp(names[language]));
        const overflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - innerWidth),
        );
        assert.equal(overflow, 0);
        report.layouts.push({ width, language, overflow });
      }
    await page.locator("#language").selectOption("zh-CN");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".hero")
      .screenshot({
        path: `${out}/screenshots/${engine}-opendraw-home-mobile.png`,
      });
    report.cases.push(
      "new verification default and translated brand fit mobile/desktop layouts",
    );
    await page.goto(base + "/verify.html", { waitUntil: "networkidle" });
    await expect(page.locator("#auditContent")).toBeVisible();
    await expect(page.locator("#coreArchive")).toBeVisible();
    await expect(page.locator("#coreArchive")).toHaveAttribute(
      "href",
      /^https:\/\/github\.com\/matthewdailytools\/market-luck\/tree\/main\/history\/(live|demo)\/[A-Za-z0-9-]+$/,
    );
    await expect(page.locator("#archiveNote")).toContainText("异步归档");
    for (const language of ["zh-CN", "en", "ja"]) {
      await page.locator("#verifyLanguage").selectOption(language);
      await expect(page.locator("[data-brand-name]")).toHaveText(
        names[language],
      );
      await expect(page.locator("#coreArchive")).toContainText("GitHub");
    }
    report.cases.push(
      "readable verification links the exact round archive and explains asynchronous observations",
    );
  } catch (e) {
    report.errors.push(e.message);
  } finally {
    await context.close();
  }
  report.status = report.errors.length ? "failed" : "passed";
  await writeFile(
    `${out}/${engine}-brand-archive-report.json`,
    JSON.stringify(report, null, 2),
  );
  return report;
}
