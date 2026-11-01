import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const root = "test-output/readme-review";
await mkdir(root, { recursive: true });
const report = {
  status: "pending",
  commit: process.env.GITHUB_SHA || null,
  runId: process.env.GITHUB_RUN_ID || null,
  execution:
    "GitHub-hosted isolated Chromium; anonymous public GitHub pages; no account writes",
  layouts: [],
};
const browser = await chromium.launch({ headless: true });
try {
  report.browser = browser.version();
  for (const [file, lang, image] of [
    ["README.md", "zh-CN", "zh-CN"],
    ["README.en.md", "en", "en"],
    ["README.ja.md", "ja", "en"],
  ])
    for (const width of [390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        locale: lang,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      try {
        const response = await page.goto(
          `https://github.com/matthewdailytools/market-luck/blob/main/${file}`,
          { waitUntil: "domcontentloaded" },
        );
        assert.equal(response.status(), 200);
        const article = page.locator("article.markdown-body").last();
        await article.waitFor({ state: "visible" });
        const cover = article.locator(
          `img[src*="social-preview.${image}.png"]`,
        );
        await cover.waitFor({ state: "visible" });
        await cover.evaluate((e) => e.decode());
        assert(
          (await article
            .locator('a[href*="/releases/tag/launch-2026-11-01"]')
            .count()) > 0,
        );
        assert(
          (await article
            .locator('a[href*="luck.onlinefreetools.org/verify.html"]')
            .count()) > 0,
        );
        const layout = await article.evaluate((e) => {
          const box = e.getBoundingClientRect();
          const img = [...e.querySelectorAll("img")].find((i) =>
            i.src.includes("social-preview."),
          );
          const b = img.getBoundingClientRect();
          return {
            articleWidth: box.width,
            coverLeft: b.left,
            coverRight: b.right,
            coverWidth: b.width,
            imageLoaded: img.complete && img.naturalWidth === 1280,
            imageNaturalHeight: img.naturalHeight,
            articleOverflow: e.scrollWidth > e.clientWidth + 1,
          };
        });
        assert.equal(layout.imageLoaded, true);
        assert.equal(layout.imageNaturalHeight, 640);
        assert.equal(layout.articleOverflow, false);
        assert(layout.coverLeft >= 0 && layout.coverRight <= width + 1);
        await article.evaluate((e) => e.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: `${root}/${lang}-${width}.png` });
        report.layouts.push({
          file,
          language: lang,
          width,
          ...layout,
          status: "passed",
        });
      } catch (error) {
        await page
          .screenshot({ path: `${root}/${lang}-${width}-failure.png` })
          .catch(() => {});
        report.error = String(error.message);
        throw error;
      } finally {
        await context.close();
      }
    }
  report.status = "passed";
} finally {
  await browser.close();
  await writeFile(
    `${root}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    status: report.status,
    layouts: report.layouts.length,
    apiWrites: 0,
  }),
);
