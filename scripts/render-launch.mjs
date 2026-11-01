import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { duration, fps, captions, hits } from "../docs/launch/timeline.js";

const out = resolve("test-output/launch-media"),
  source = resolve("docs/launch");
await mkdir(out, { recursive: true });
const video = process.env.RENDER_VIDEO !== "false";
const run = (command, args) => {
  const r = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8e6 });
  assert.equal(r.status, 0, (r.stderr || r.error?.message || "").slice(-2500));
  return r.stdout;
};
const stamp = (t) =>
  `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(Math.floor(t) % 60).padStart(2, "0")},000`;
for (const language of ["zh", "en"]) {
  const srt = captions
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c[language]}\n`,
    )
    .join("\n");
  await writeFile(
    resolve(
      out,
      `opendraw-one-minute.${language === "zh" ? "zh-CN" : "en"}.srt`,
    ),
    srt,
  );
  for (const c of captions) {
    const min =
      language === "zh" ? [...c.zh].length / 4.5 + 1.5 : c.en.length / 15 + 1.5;
    assert(c.end - c.start >= min, `Caption too brief: ${c[language]}`);
  }
}
await copyFile(
  resolve(source, "demo-evidence.json"),
  resolve(out, "demo-evidence.json"),
);
const allowed = new Set([
  "media.html",
  "media.js",
  "timeline.js",
  "demo-evidence.json",
]);
const server = createServer(async (req, res) => {
  try {
    const file =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(
        1,
      ) || "media.html";
    if (!allowed.has(file)) {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(resolve(source, file));
    res.setHeader(
      "Content-Type",
      extname(file) === ".html"
        ? "text/html; charset=utf-8"
        : extname(file) === ".js"
          ? "text/javascript; charset=utf-8"
          : "application/json",
    );
    res.end(data);
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
let browser;
const evidence = JSON.parse(
  await readFile(resolve(source, "demo-evidence.json"), "utf8"),
);
const report = {
  status: "pending",
  sourceCommit: process.env.GITHUB_SHA || null,
  runId: process.env.GITHUB_RUN_ID || null,
  browser: null,
  video,
  checks: [],
  screenshots: [],
  evidence: {
    fixtureSha256: evidence.fixtureSha256,
    validExit: evidence.valid.exitCode,
    tamperExit: evidence.tamper.exitCode,
    publicChecks: evidence.checks.length,
  },
  errors,
};
try {
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const language of ["zh-CN", "en"]) {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto(base + `/media.html?mode=cover&lang=${language}`);
    await page.waitForFunction(() => window.__ready);
    await page.evaluate(() => document.fonts.ready);
    const image = await page.screenshot({
      path: resolve(out, `social-preview.${language}.png`),
    });
    assert(image.length < 1e6);
    assert.equal(image.readUInt32BE(16), 1280);
    assert.equal(image.readUInt32BE(20), 640);
    const overflow = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".cover h1,.cover .brand,.cover .chip,.cover code",
        ),
      ]
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.textContent),
    );
    assert.deepEqual(overflow, []);
    report.checks.push({
      kind: "social-preview",
      language,
      width: 1280,
      height: 640,
      bytes: image.length,
      overflow: [],
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(base + "/media.html?mode=models");
  await page.waitForFunction(() => window.__ready);
  await page.screenshot({ path: resolve(out, "model-sheet.png") });
  await page.goto(base + "/media.html");
  await page.waitForFunction(() => window.__ready);
  await page.evaluate(() => document.fonts.ready);
  for (const t of [
    0, 6, 12, 17.9, 18, 23, 25, 28, 31.9, 32, 37.9, 38, 45.9, 46, 52, 59.9,
  ]) {
    const state = await page.evaluate((t) => window.__render(t), t);
    assert.equal(state.overflow, false);
    const layout = await page.evaluate(() => {
      const w = document.querySelector("#camera").getBoundingClientRect(),
        c = document.querySelector(".caption").getBoundingClientRect();
      const overflow = [
        ...document.querySelectorAll(
          "#scene code,#scene h1,#scene h2,.caption .zh,.caption .en",
        ),
      ]
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.textContent);
      const scene = document.querySelector('#scene');
      return { windowBottom: w.bottom, captionTop: c.top, overflow, contentOverflow: scene.scrollHeight > scene.clientHeight + 1 };
    });
    assert(layout.windowBottom < layout.captionTop);
    assert.deepEqual(layout.overflow, []);
    assert.equal(layout.contentOverflow, false);
    if (t === 28) assert.equal(state.valid, true);
    if (t === 38) assert.equal(state.rejected, true);
    report.checks.push({ kind: "timeline", t, ...state });
  }
  for (const t of [8, 27, 40, 59.9]) {
    await page.evaluate((t) => window.__render(t), t);
    const file = `frame-${t === 59.9 ? "end" : t}.jpg`;
    await page.screenshot({
      path: resolve(out, file),
      type: "jpeg",
      quality: 92,
    });
    report.screenshots.push(file);
  }
  await page.evaluate(() => window.__render(8));
  await page.screenshot({
    path: resolve(out, "poster.jpg"),
    type: "jpeg",
    quality: 94,
  });
  assert.deepEqual(errors, []);
  if (video) {
    const rate = 48000,
      channels = 2,
      total = duration * rate,
      buf = Buffer.alloc(44 + total * channels * 2);
    buf.write("RIFF");
    buf.writeUInt32LE(buf.length - 8, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * channels * 2, 28);
    buf.writeUInt16LE(channels * 2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(buf.length - 44, 40);
    const notes = [
      { t: 0, hz: 261.626 },
      { t: 0.5, hz: 329.628 },
      { t: 1, hz: 391.995 },
      { t: 52, hz: 261.626 },
      { t: 54, hz: 329.628 },
      { t: 56, hz: 391.995 },
    ];
    for (let i = 0; i < total; i++) {
      const t = i / rate;
      let v =
        0.002 * Math.sin(t * 2 * Math.PI * 94) +
        0.0012 * Math.sin(t * 2 * Math.PI * 141);
      for (const n of notes) {
        const d = t - n.t;
        if (d >= 0 && d < 2)
          v +=
            0.042 * Math.sin(2 * Math.PI * n.hz * d) * Math.exp(-d * 3) +
            0.006 *
              Math.sign(Math.sin(2 * Math.PI * n.hz * 2 * d)) *
              Math.exp(-d * 8);
      }
      for (const h of hits) {
        const d = t - h;
        if (d >= 0 && d < 0.18)
          v +=
            0.035 *
            Math.sin(2 * Math.PI * (h === 38 ? 196 : 880) * d) *
            Math.exp(-d * 30);
      }
      if (t >= 12 && t < 17.5) {
        const d = (t - 12) % 0.087;
        if (d < 0.027)
          v += 0.022 * Math.sin(d * 2 * Math.PI * 1700) * Math.exp(-d * 140);
      }
      if ((t >= 17.6 && t < 18) || (t >= 35.6 && t < 36)) v *= 0.02;
      v *= Math.min(1, t / 0.08, (60 - t) / 0.5);
      const sample = Math.round(Math.max(-0.99, Math.min(0.99, v)) * 32767);
      buf.writeInt16LE(sample, 44 + i * 4);
      buf.writeInt16LE(sample, 46 + i * 4);
    }
    const wav = resolve(out, "score.wav");
    await writeFile(wav, buf);
    const target = resolve(out, "opendraw-one-minute.mp4");
    let ffLog = "";
    const enc = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "warning",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        "-i",
        wav,
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-af",
        "loudnorm=I=-14:TP=-2:LRA=7",
        "-movflags",
        "+faststart",
        target,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    enc.stderr.on("data", (b) => (ffLog += b));
    const exit = once(enc, "close");
    for (let n = 0; n < duration * fps; n++) {
      await page.evaluate((t) => window.__render(t), n / fps);
      const image = await page.screenshot({ type: "jpeg", quality: 88 });
      if (!enc.stdin.write(image)) await once(enc.stdin, "drain");
      if (n % 300 === 0)
        console.log(
          JSON.stringify({ renderedFrames: n, total: duration * fps }),
        );
    }
    enc.stdin.end();
    const [code] = await exit;
    assert.equal(code, 0, ffLog.slice(-2000));
    const probe = JSON.parse(
      run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        target,
      ]),
    );
    const vs = probe.streams.find((s) => s.codec_type === "video"),
      as = probe.streams.find((s) => s.codec_type === "audio");
    assert.equal(vs.codec_name, "h264");
    assert.equal(as.codec_name, "aac");
    assert.equal(vs.width, 1280);
    assert.equal(vs.height, 720);
    assert.equal(vs.r_frame_rate, "30/1");
    assert(Math.abs(Number(probe.format.duration) - 60) < 0.1);
    run("ffmpeg", ["-v", "error", "-i", target, "-f", "null", "-"]);
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      target,
      "-vf",
      "fps=1/5,scale=320:180,tile=4x3",
      "-frames:v",
      "1",
      resolve(out, "contact-sheet.jpg"),
    ]);
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      "30",
      "-t",
      "12",
      "-i",
      target,
      "-filter_complex",
      "fps=8,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer",
      "-loop",
      "0",
      resolve(out, "replay-preview.gif"),
    ]);
    const loud = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        target,
        "-af",
        "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    assert.equal(loud.status, 0);
    const measured = JSON.parse(
      loud.stderr.slice(loud.stderr.lastIndexOf("{")),
    );
    assert(Number(measured.input_tp) < -1);
    assert(Math.abs(Number(measured.input_i) + 14) < 2);
    report.movie = {
      duration: Number(probe.format.duration),
      width: vs.width,
      height: vs.height,
      fps: 30,
      videoCodec: vs.codec_name,
      audioCodec: as.codec_name,
      frames: 1800,
      bytes: (await stat(target)).size,
      sha256: createHash("sha256")
        .update(await readFile(target))
        .digest("hex"),
      decodedEntireFile: true,
      measuredLufs: Number(measured.input_i),
      measuredTruePeak: Number(measured.input_tp),
      narration: false,
      subtitleLanguages: ["zh-CN", "en"],
    };
  }
  report.status = "passed";
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    resolve(out, "media-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    status: report.status,
    video,
    checks: report.checks.length,
    movie: report.movie,
    errors,
  }),
);
