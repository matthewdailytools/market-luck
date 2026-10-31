import { readFile, writeFile, mkdir } from "node:fs/promises";
const base =
  process.env.REPLAY_URL ||
  "https://market-luck-replay.dailyonetools.workers.dev";
const token =
  process.env.REPLAY_ADMIN_TOKEN ||
  (await readFile(".wrangler/replay-admin-token", "utf8"));
for (const phase of ["setup", "boundary", "settle"]) {
  const r = await fetch(base + "/run?phase=" + phase, {
    method: "POST",
    headers: { authorization: "Bearer " + token },
    signal: AbortSignal.timeout(180000),
  });
  const data = await r.json();
  await mkdir("test-output", { recursive: true });
  await writeFile(
    "test-output/live-replay-" + phase + ".json",
    JSON.stringify(data, null, 2),
  );
  console.log(
    JSON.stringify({
      phase,
      status: r.status,
      ok: data.ok,
      round: data.round,
      checks: data.checks?.length,
      error: data.error,
    }),
  );
  if (!r.ok || !data.ok) process.exit(1);
  if (data.proof)
    await writeFile(
      "test-output/live-replay-proof.json",
      JSON.stringify(data.proof, null, 2),
    );
}
