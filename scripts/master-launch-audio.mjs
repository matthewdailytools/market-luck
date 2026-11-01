import { spawnSync } from "node:child_process";
import { readFile, writeFile, stat, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Compress transient peaks, then level the sparse score before final loudness trim.
export const launchAudioFilter =
  "acompressor=threshold=0.01:ratio=6:attack=2:release=150:makeup=1,loudnorm=I=-14:TP=-2:LRA=7,loudnorm=I=-14:TP=-2:LRA=7";
const run = (args) => {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 8e6 });
  assert.equal(r.status, 0, r.stderr?.slice(-2000));
  return r;
};
const videoHash = (path) =>
  run([
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-f",
    "hash",
    "-hash",
    "sha256",
    "-",
  ]).stdout.trim();
async function master(directory) {
  const out = resolve(directory),
    path = resolve(out, "opendraw-one-minute.mp4"),
    temp = resolve(out, "mastered.mp4");
  const report = JSON.parse(
    await readFile(resolve(out, "media-report.json"), "utf8"),
  );
  assert.equal(report.checks.length, 18);
  assert.deepEqual(report.errors, []);
  assert(report.checks.some((c) => c.valid));
  assert(report.checks.some((c) => c.rejected));
  const before = videoHash(path);
  run([
    "-y",
    "-v",
    "error",
    "-i",
    path,
    "-i",
    resolve(out, "score.wav"),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-af",
    launchAudioFilter,
    "-t",
    "60",
    "-movflags",
    "+faststart",
    temp,
  ]);
  const after = videoHash(temp);
  assert.equal(
    after,
    before,
    "Mastering must preserve every encoded video packet",
  );
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", temp],
    { encoding: "utf8" },
  );
  assert.equal(probe.status, 0);
  const parsed = JSON.parse(probe.stdout),
    v = parsed.streams.find((s) => s.codec_type === "video"),
    a = parsed.streams.find((s) => s.codec_type === "audio");
  assert.equal(v.codec_name, "h264");
  assert.equal(a.codec_name, "aac");
  assert.equal(a.sample_rate, "48000");
  assert.equal(v.width, 1280);
  assert.equal(v.height, 720);
  assert.equal(v.r_frame_rate, "30/1");
  assert.equal(Number(v.nb_frames), 1800);
  assert(Math.abs(Number(parsed.format.duration) - 60) < 0.1);
  run(["-v", "error", "-i", temp, "-f", "null", "-"]);
  const meter = run([
    "-hide_banner",
    "-i",
    temp,
    "-af",
    "loudnorm=I=-14:TP=-2:LRA=7:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const measured = JSON.parse(
    meter.stderr.slice(
      meter.stderr.lastIndexOf("{"),
      meter.stderr.lastIndexOf("}") + 1,
    ),
  );
  assert(
    Math.abs(Number(measured.input_i) + 14) < 1,
    "Final integrated loudness must be within 1 LU of -14",
  );
  assert(
    Number(measured.input_tp) < -1,
    "AAC true peak must stay below -1 dBTP",
  );
  await rename(temp, path);
  report.initialCaptureRun = report.runId;
  report.initialCaptureStatus = report.status;
  report.masteringRunId = process.env.GITHUB_RUN_ID || null;
  report.mastering = {
    sourceSha256: createHash("sha256")
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest("hex"),
    filter: launchAudioFilter,
    videoStreamHashBefore: before,
    videoStreamHashAfter: after,
    videoPacketsUnchanged: true,
    reason:
      "The initial full capture passed visual checks but its sparse score missed the loudness target; only audio was remastered.",
  };
  report.movie = {
    duration: Number(parsed.format.duration),
    width: v.width,
    height: v.height,
    fps: 30,
    frames: 1800,
    videoCodec: v.codec_name,
    audioCodec: a.codec_name,
    audioSampleRate: 48000,
    bytes: (await stat(path)).size,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    decodedEntireFile: true,
    measuredLufs: Number(measured.input_i),
    measuredTruePeak: Number(measured.input_tp),
    narration: false,
    subtitleLanguages: ["zh-CN", "en"],
  };
  report.status = "passed";
  await writeFile(
    resolve(out, "media-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      movie: report.movie,
      videoPacketsUnchanged: true,
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await master(process.argv[2] || "test-output/launch-media");
