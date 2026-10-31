import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ticketFixture } from "./ticket-fixtures.mjs";
import { runShareAcceptance } from "./share-acceptance.mjs";

// This runner uses an isolated GitHub-hosted Linux browser, never the user's
// desktop browser, profile, extensions or the desktop app's disabled controls.
assert(
  process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_OS === "Linux",
  "Run this browser acceptance in the repository's GitHub Actions workflow",
);
const base = process.env.BROWSER_TEST_BASE || "http://127.0.0.1:8787";
const online = process.env.BROWSER_TEST_ONLINE === "true";
assert(
  online
    ? base === "https://luck-test.onlinefreetools.org"
    : /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base),
  "Unexpected acceptance origin",
);
const out = "test-output/ticket-browser";
await mkdir(out + "/screenshots", { recursive: true });
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  execution: "GitHub-hosted Linux; isolated headless Chromium and WebKit",
  commit: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  browserVersions: {},
  online,
  base,
  layout: [],
  flows: [],
  failures: [],
  runtimeErrors: [],
  screenshots: [],
};
const sizes = [
  [320, 568],
  [360, 740],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 900],
];
const languages = ["zh-CN", "en", "ja"],
  themes = ["points", "verify", "world"];
const secrets = new Set();
const clean = (value) => {
  let text = String(value);
  for (const secret of secrets)
    if (secret) text = text.replaceAll(secret, "[redacted]");
  return text.slice(0, 2000);
};
const fail = (label, error) =>
  report.failures.push({ label, reason: clean(error?.message || error) });
const flush = () =>
  writeFile(
    out + "/report.json",
    JSON.stringify(
      { ...report, finishedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
async function screenshot(page, name, section = true) {
  const file = "screenshots/" + name + ".png";
  if (section)
    await page
      .locator("#myTickets")
      .screenshot({ path: out + "/" + file, animations: "disabled" });
  else
    await page.screenshot({ path: out + "/" + file, animations: "disabled" });
  report.screenshots.push(file);
}
function watch(page) {
  page.on("pageerror", (error) =>
    report.runtimeErrors.push(clean(error.message)),
  );
  page.setDefaultTimeout(12000);
}
async function ready(page, origin = base) {
  await page.goto(origin + "/#myTickets", { waitUntil: "networkidle" });
  await page
    .locator("#ticketHistorySummary")
    .filter({ hasNotText: /正在读取|Loading your tickets|自分の券を取得中/ })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function measure(page) {
  return page.evaluate(() => {
    const section = document.querySelector("#myTickets");
    const visible = (el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.display !== "none" &&
        s.visibility !== "hidden"
      );
    };
    const bounds = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
        scroll: el.scrollWidth,
        client: el.clientWidth,
      };
    };
    const rgb = (s) => {
      const a = s.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
      return [a[0], a[1], a[2], a[3] ?? 1];
    };
    const lum = (rgb) =>
      rgb
        .slice(0, 3)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    function contrast(el) {
      let p = el,
        bg = [255, 255, 255, 1];
      while (p) {
        const c = rgb(getComputedStyle(p).backgroundColor);
        if (c[3] === 1) {
          bg = c;
          break;
        }
        p = p.parentElement;
      }
      let fg = rgb(getComputedStyle(el).color);
      fg = fg.map((v, i) => (i < 3 ? v * fg[3] + bg[i] * (1 - fg[3]) : 1));
      const a = lum(fg),
        b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    const controls = [...section.querySelectorAll("a,button")]
      .filter((el) => visible(el) && !el.disabled)
      .map((el) => ({
        id: el.id || el.className,
        text: el.textContent.slice(0, 50),
        ...bounds(el),
      }));
    const contrastSelectors = [
      "#ticketHistoryNote",
      "#ticketHistoryEmpty",
      ".ticket-card-meta dt",
      ".ticket-card-meta dd",
      ".ticket-mode",
      ".ticket-card-note",
      ".ticket-status",
      ".ticket-ball",
      ".ticket-ball.bonus",
      "#ticketHistoryRefresh:not(:disabled)",
      "#ticketHistoryLogin:not([hidden])",
      "#ticketHistoryChoose",
      ".ticket-card-actions a",
    ];
    const contrasts = contrastSelectors.flatMap((selector) =>
      [...section.querySelectorAll(selector)]
        .filter(visible)
        .slice(0, 3)
        .map((el) => ({
          selector,
          ratio: contrast(el),
          color: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
          font: getComputedStyle(el).fontSize,
        })),
    );
    const meta = [...section.querySelectorAll(".ticket-card-meta dd")].map(
      bounds,
    );
    return {
      width: innerWidth,
      height: innerHeight,
      language: document.documentElement.lang,
      theme: document.body.dataset.campaign,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      documentWidth: document.documentElement.scrollWidth,
      overflowingElements:
        document.documentElement.scrollWidth > innerWidth + 1
          ? [...document.querySelectorAll("body *")]
              .filter(visible)
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.right > innerWidth + 1 || r.left < -1;
              })
              .slice(0, 20)
              .map((el) => ({
                tag: el.tagName,
                id: el.id,
                className: String(el.className).slice(0, 100),
                ...bounds(el),
              }))
          : [],
      section: bounds(section),
      cards: [...section.querySelectorAll(".ticket-card")]
        .map(bounds)
        .slice(0, 3),
      controls,
      contrasts,
      metaOverflow: meta.some((r) => r.scroll > r.client + 1),
      chooseVisible: visible(document.querySelector("#ticketHistoryChoose")),
      statuses: [...section.querySelectorAll(".ticket-card")].map(
        (el) => el.dataset.ticketStatus,
      ),
    };
  });
}
function validateLayout(m) {
  const problems = [];
  if (m.pageOverflow) problems.push("page horizontal overflow");
  if (
    m.section.left < -1 ||
    m.section.right > m.width + 1 ||
    m.section.scroll > m.section.client + 1
  )
    problems.push("ticket section overflow");
  if (m.metaOverflow) problems.push("ticket metadata clipped");
  if (!m.chooseVisible) problems.push("next-ticket action hidden");
  for (const c of m.controls)
    if (c.height < 43.5 || c.left < -1 || c.right > m.width + 1)
      problems.push("control target or bounds: " + c.id);
  for (const c of m.contrasts)
    if (c.ratio < 4.5)
      problems.push(
        "text contrast below 4.5: " + c.selector + " (" + c.ratio + ")",
      );
  return [...new Set(problems)];
}
async function matrix(
  page,
  { engine, source, variant, widths = sizes, allThemes = true, capture = true },
) {
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height });
    for (const language of languages) {
      await page.locator("#language").selectOption(language);
      for (const theme of allThemes ? themes : ["points"]) {
        await page.locator(`[data-campaign-choice="${theme}"]`).click();
        await expect(page.locator("body")).toHaveAttribute(
          "data-campaign",
          theme,
        );
        await page.locator("#myTickets").scrollIntoViewIfNeeded();
        const m = { engine, source, variant, ...(await measure(page)) };
        m.requestedViewport = { width, height };
        m.problems = validateLayout(m);
        if (m.width !== width || m.height !== height)
          m.problems.push(
            "rendered viewport differs from requested dimensions",
          );
        report.layout.push(m);
        if (m.problems.length)
          report.failures.push({
            label: `${engine}/${source}/${variant}/${width}/${language}/${theme}`,
            reason: m.problems.join("; "),
          });
        if (
          capture &&
          language === "zh-CN" &&
          theme === "points" &&
          [320, 390, 1280].includes(width)
        )
          await screenshot(page, `${engine}-${source}-${variant}-${width}`);
      }
    }
    await flush();
  }
}
async function fixtures(browser, engine) {
  const kinds =
    engine === "chromium"
      ? [
          "anonymous",
          "empty",
          "pending",
          "paid",
          "lost",
          "paused",
          "unverified",
          "older",
          "zero",
          "invalid",
          "long",
        ]
      : ["anonymous", "pending", "paid"];
  for (const kind of kinds) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    watch(page);
    const fixture = ticketFixture(kind);
    await page.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") return route.abort();
      if (p === "/api/state")
        return route.fulfill({
          json: { ...fixture.state, serverTime: Date.now() },
        });
      if (p === "/api/round/" + fixture.round.id && kind === "older")
        return route.fulfill({
          json: {
            serverTime: Date.now(),
            demo: true,
            round: fixture.round,
            anchor: null,
            attempts: [],
          },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Controlled visual fixture: record unavailable" },
      });
    });
    try {
      await ready(page);
      const cards = page.locator("#tickets .ticket-card");
      await expect(cards).toHaveCount(
        ["anonymous", "empty"].includes(kind) ? 0 : 1,
      );
      if (fixture.expected)
        await expect(cards.first()).toHaveAttribute(
          "data-ticket-status",
          fixture.expected,
        );
      const core = ["anonymous", "empty", "pending", "paid"].includes(kind);
      const widths =
        engine === "webkit"
          ? [sizes[0], sizes[2], sizes[4]]
          : core
            ? sizes
            : [sizes[0], sizes[2], sizes[4]];
      await matrix(page, {
        engine,
        source: "fixture",
        variant: kind,
        widths,
        allThemes: core || engine === "webkit",
        capture: ["anonymous", "empty", "pending", "paid", "long"].includes(
          kind,
        ),
      });
      if (kind === "pending") {
        await expect(page.locator(".ticket-ball.bonus")).toHaveText("00");
        await expect(
          page.locator(".ticket-card-meta > div:last-child dd"),
        ).toHaveText("未精算");
        await page.locator("#ticketHistoryRefresh").focus();
        const focus = await page
          .locator("#ticketHistoryRefresh")
          .evaluate((el) => ({
            active: document.activeElement === el,
            outline: getComputedStyle(el).outlineWidth,
          }));
        assert(
          focus.active && parseFloat(focus.outline) > 0,
          "Keyboard focus must remain visible",
        );
        report.flows.push({
          engine,
          source: "fixture",
          case: "keyboard focus and German zero",
          status: "passed",
        });
      }
    } catch (error) {
      fail(`${engine}/fixture/${kind}`, error);
      await screenshot(page, `${engine}-fixture-${kind}-failure`, false).catch(
        () => {},
      );
    }
    await context.close();
    await flush();
  }
}
async function liveReadonly(browser, engine) {
  const origin = "https://luck.onlinefreetools.org";
  const context = await browser.newContext({
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  watch(page);
  let writes = 0;
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.continue();
  });
  const before = await (
    await context.request.get(origin + "/api/state")
  ).json();
  try {
    await ready(page, origin);
    await expect(page.locator("#tickets .ticket-card")).toHaveCount(0);
    await matrix(page, {
      engine,
      source: "online-live-readonly",
      variant: "anonymous",
      widths: engine === "chromium" ? sizes : [sizes[0], sizes[2], sizes[4]],
      allThemes: engine === "chromium",
    });
    assert.equal(writes, 0, "LIVE browser must send no API writes");
    const after = await (
      await context.request.get(origin + "/api/state")
    ).json();
    for (const r of before.rounds) {
      const current = after.rounds.find((x) => x.id === r.id);
      assert.deepEqual(
        current?.manifest,
        r.manifest,
        "Live rules must not change",
      );
      assert.equal(
        current?.commitment,
        r.commitment,
        "Live commitment must not change",
      );
    }
    report.flows.push({
      engine,
      source: "online-live-readonly",
      case: "anonymous LIVE, zero API writes, unchanged commitments",
      status: "passed",
      poolBefore: before.pool,
      poolAfter: after.pool,
    });
  } catch (error) {
    fail(`${engine}/online-live-readonly`, error);
  }
  await context.close();
}
async function actualFlow(browser, engine, mobile) {
  const account = JSON.parse(
    await readFile("test-output/onboarding-browser-account.json", "utf8"),
  );
  assert.equal(account.url, base, "Test credential origin must match exactly");
  secrets.add(account.password);
  secrets.add(account.name);
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  watch(page);
  const activate = async (selector) =>
    mobile ? page.locator(selector).tap() : page.locator(selector).click();
  try {
    await ready(page);
    await activate("#ticketHistoryLogin");
    await expect(page.locator("#auth")).toBeVisible();
    await expect(page.locator("#authLoginTab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("#authLoginTab").press("ArrowLeft");
    await expect(page.locator("#authRegisterTab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("#authRegisterTab").press("ArrowRight");
    await expect(page.locator("#password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await page.locator("#closeAuth").press("Escape");
    await expect(page.locator("#auth")).not.toBeVisible();
    await activate("#ticketHistoryLogin");
    await page.locator("#name").fill(account.name);
    await page.locator("#password").fill(account.password);
    await activate("#authSubmit");
    await expect(page.locator("#auth")).not.toBeVisible();
    await expect(page.locator("#tickets .ticket-card")).toHaveCount(1);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "myTickets",
      "Sign-in should return focus to ticket history",
    );
    await expect(page.locator("#purchaseReview")).not.toBeVisible();
    await expect(page.locator("#toast")).toBeVisible();
    const auditLink = page.locator(".ticket-card-actions a");
    await auditLink.scrollIntoViewIfNeeded();
    const immediateTarget = await auditLink.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const target = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return Boolean(target && (target === el || el.contains(target)));
    });
    assert(
      immediateTarget,
      "A login notification must not cover the verification click target",
    );
    await activate(".ticket-card-actions a");
    await expect(page.locator("#auditContent")).toBeVisible();
    const visitedRound = new URL(page.url()).searchParams.get("round");
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page.locator("#tickets .ticket-card")).toHaveCount(1);
    await expect(page.locator("#toast")).toBeHidden();
    const before = await (
      await context.request.get(base + "/api/state")
    ).json();
    const ticket = before.tickets[0];
    assert(ticket && ticket.user_id === before.me.id);
    assert.equal(
      visitedRound,
      ticket.round_id,
      "Immediate verification must open the purchased ticket's round",
    );
    await expect(page.locator(".ticket-card")).toHaveAttribute(
      "data-ticket-id",
      ticket.id,
    );
    await expect(page.locator("#ticketHistoryChoose")).toBeVisible();
    await screenshot(
      page,
      `${engine}-${online ? "online-demo" : "local-real-api"}-${mobile ? "mobile" : "desktop"}`,
    );
    if (mobile)
      await matrix(page, {
        engine,
        source: online ? "online-demo" : "local-real-api",
        variant: "owned-ticket",
        widths: engine === "chromium" ? sizes : [sizes[0], sizes[2], sizes[4]],
        allThemes: true,
        capture: online,
      });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await page.locator("#language").selectOption("zh-CN");
    let hold = true,
      resolveHold;
    const holdPromise = new Promise((resolve) => (resolveHold = resolve));
    await page.route("**/api/state", async (route) => {
      if (hold) await holdPromise;
      return route.continue();
    });
    await activate("#ticketHistoryRefresh");
    await expect(page.locator("#ticketHistoryRefresh")).toBeDisabled();
    hold = false;
    resolveHold();
    await expect(page.locator("#ticketHistoryRefresh")).toBeEnabled();
    await page.unroute("**/api/state");
    await page.route("**/api/state", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Intentional browser acceptance refresh failure" },
      }),
    );
    await activate("#ticketHistoryRefresh");
    await expect(page.locator("#ticketHistoryLoadStatus")).toContainText(
      "刷新失败",
    );
    await expect(page.locator(".ticket-card")).toHaveAttribute(
      "data-ticket-id",
      ticket.id,
    );
    await screenshot(
      page,
      `${engine}-${online ? "online-demo" : "local-real-api"}-refresh-error`,
    );
    await page.unroute("**/api/state");
    await activate("#ticketHistoryRefresh");
    await expect(page.locator("#ticketHistoryLoadStatus")).toBeHidden();
    const after = await (await context.request.get(base + "/api/state")).json();
    assert.equal(
      after.tickets.length,
      before.tickets.length,
      "Viewing records cannot create a ticket",
    );
    assert.equal(after.tickets[0].id, ticket.id);
    assert.equal(after.tickets[0].numbers, ticket.numbers);
    assert.equal(
      after.me.balance - before.me.balance,
      (after.tickets[0].prize || 0) - (ticket.prize || 0),
      "Only a naturally settled prize may change the balance",
    );
    await activate("#ticketHistoryChoose");
    await expect(page).toHaveURL(/#worldFormats$/);
    await page.locator("#logout").click();
    await expect(page.locator("#tickets .ticket-card")).toHaveCount(0);
    await expect(page.locator("#ticketHistoryLogin")).toBeVisible();
    report.flows.push({
      engine,
      source: online ? "online-demo" : "local-real-api",
      mobile,
      case: "sign-in/cancel/keyboard/touch/immediate verification through notification/refresh-error/retry/next-pick/logout",
      status: "passed",
      ticketCount: after.tickets.length,
      balanceBefore: before.me.balance,
      balanceAfter: after.me.balance,
      uniquePurchasesByBrowser: 0,
    });
  } catch (error) {
    fail(`${engine}/actual-flow/${mobile ? "mobile" : "desktop"}`, error);
    await screenshot(
      page,
      `${engine}-actual-flow-failure-${mobile}`,
      false,
    ).catch(() => {});
  }
  await context.close();
  await flush();
}
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  let browser;
  try {
    browser = await type.launch({ headless: true });
    report.browserVersions[engine] = browser.version();
    report.shareAcceptance ||= [];
    const share = await runShareAcceptance({
      browser,
      engine,
      base,
      online,
      out,
    });
    report.shareAcceptance.push(share);
    if (share.status !== "passed")
      fail(engine + "/share", JSON.stringify(share.errors));
    if (!online) await fixtures(browser, engine);
    await actualFlow(browser, engine, true);
    if (engine === "chromium") await actualFlow(browser, engine, false);
    if (online) await liveReadonly(browser, engine);
  } catch (error) {
    fail(engine, error);
  } finally {
    await browser?.close();
    await flush();
  }
}
report.status =
  report.failures.length || report.runtimeErrors.length ? "failed" : "passed";
report.finishedAt = new Date().toISOString();
await flush();
console.log(
  JSON.stringify({
    status: report.status,
    online,
    layoutCases: report.layout.length,
    flows: report.flows.length,
    failures: report.failures.length,
    failureDetails: report.failures,
    runtimeErrors: report.runtimeErrors.length,
    screenshots: report.screenshots.length,
  }),
);
if (report.status !== "passed") process.exitCode = 1;
