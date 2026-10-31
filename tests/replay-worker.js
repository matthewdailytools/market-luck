// This entry point is never used by the LIVE deployment. Dedicated test D1/R2 only.
import { createWorker } from "../src/worker.js";
import { sessionFor } from "../src/calendar.js";
import { collectAndSettle, liveManifest } from "../src/live.js";
import { publicConsensus } from "../src/public-market-data.js";
import { hash, evidence } from "../src/engine.js";
export default {
  async fetch(request, env) {
    const reply = (v, status = 200) => Response.json(v, { status });
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/run" ||
      !env.ADMIN_TOKEN ||
      request.headers.get("authorization") !== "Bearer " + env.ADMIN_TOKEN
    )
      return reply({ error: "Test runner authorization required" }, 403);
    if (env.INSTALLATION_KIND !== "ONLINE_REPLAY")
      return reply({ error: "Dedicated replay installation required" }, 403);
    const phase = new URL(request.url).searchParams.get("phase") || "setup";
    let checks = [];
    let now = Date.parse("2026-10-28T00:00:00Z");
    const q = (s, ...a) => env.DB.prepare(s).bind(...a);
    const setTime = async (n) => {
      now = n;
      await q("UPDATE test_clock SET now=? WHERE id=1", n).run();
    };
    try {
      const worker = createWorker(() => now);
      let cookie = "";
      let before, m, round, ticket, row;
      if (phase !== "setup") {
        const saved = await (
          await env.EVIDENCE.get("replay/checkpoint.json")
        ).json();
        ({ before, m, round, ticket, cookie, checks, now } = saved);
        await setTime(now);
        row = await q("SELECT * FROM rounds WHERE id=?", round).first();
      }
      const checkpoint = async (next) => {
        await env.EVIDENCE.put(
          "replay/checkpoint.json",
          JSON.stringify({ before, m, round, ticket, cookie, checks, now }),
        );
        return reply({
          ok: true,
          environment: "ONLINE_REPLAY",
          phase,
          next,
          round,
          checks,
        });
      };
      async function call(path, body, status = 200) {
        const response = await worker.fetch(
          new Request("https://replay.invalid/api/" + path, {
            method: body ? "POST" : "GET",
            headers: {
              origin: "https://replay.invalid",
              cookie,
              "content-type": "application/json",
              authorization: "Bearer " + env.ADMIN_TOKEN,
              "CF-Connecting-IP": "isolated-replay-" + crypto.randomUUID(),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
          { ...env, ABUSE_IP_KEY: "isolated-replay-test-transport-only" },
        );
        const data = await response.json();
        if (response.status !== status)
          throw Error(
            path +
              " expected " +
              status +
              " received " +
              response.status +
              " " +
              JSON.stringify(data),
          );
        if (response.headers.get("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";")[0];
        checks.push(path + ":" + status);
        return data;
      }
      if (phase === "setup") {
        await setTime(now);
        await q("UPDATE rounds SET status='paused' WHERE status='open'").run();
        await call("register", {
          name: "replay" + Date.now(),
          password: "replay-test-password-123",
        });
        before = await call("state");
        // Build the legacy manifest only in this authenticated test entry point.
        // Production /api/admin/prepare always creates v2 and has no downgrade.
        const legacy = liveManifest(
          {
            cutoff: sessionFor("2026-10-29").cutoff,
            markets: ["AAPL", "MSFT", "IBM"].map((s) => ({
              symbol: (s === "IBM" ? "XNYS:" : "XNAS:") + s,
              date: "2026-10-29",
              currency: "USD",
              scale: 2,
            })),
          },
          now,
        );
        const prepared = {
          manifest: legacy,
          commitment: hash(JSON.stringify(legacy)),
        };
        await q(
          "INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status) VALUES(?,?,?,?,?,'draft')",
          legacy.id,
          JSON.stringify(legacy),
          prepared.commitment,
          legacy.cutoff,
          legacy.ready,
        ).run();
        m = prepared.manifest;
        round = m.id;
        // Replay's external-publishing stage is simulated, and is labeled in the report.
        // Production /admin/publish really fetches an immutable GitHub commit instead.
        await env.DB.batch([
          q(
            "INSERT INTO anchors(round_id,url,published,verified_hash,verified_at) VALUES(?,?,?,?,?)",
            round,
            "https://replay.invalid/SIMULATED-ANCHOR",
            now,
            prepared.commitment,
            now,
          ),
          q("UPDATE rounds SET status='open' WHERE id=?", round),
        ]);
        checks.push("REPLAY simulated anchor (not real external publication)");
        const knownPrices = [];
        for (const p of m.markets) {
          const r = await publicConsensus(p.symbol.split(":")[1], p.date);
          if (!r.ok) throw Error("Historical test input unavailable");
          knownPrices.push({
            symbol: p.symbol,
            date: p.date,
            currency: p.currency,
            scale: p.scale,
            close: r.closeMinorUnits,
          });
        }
        const winning = evidence(
          {
            id: round,
            manifest: JSON.stringify(m),
            commitment: prepared.commitment,
          },
          knownPrices,
        ).results.cn;
        ticket = {
          round,
          game: "cn",
          main: winning.main,
          bonus: winning.bonus,
          key: crypto.randomUUID(),
        };
        checks.push(
          "Known historical winning numbers used ONLY in isolated REPLAY",
        );
        await call("buy", ticket);
        await call("buy", ticket);
        row = await q("SELECT * FROM rounds WHERE id=?", round).first();
      }
      const rejected = async (label, fn) => {
        let error;
        try {
          await fn();
        } catch (e) {
          error = e;
        }
        if (!error) throw Error("Expected rejection: " + label);
        checks.push(label + ":rejected");
      };
      if (phase === "setup") {
        await rejected("LIVE cutoff cannot be changed", () =>
          q("UPDATE rounds SET cutoff=cutoff+1 WHERE id=?", round).run(),
        );
        await call("demo/advance", { round }, 403);
        return checkpoint("boundary");
      }
      if (phase === "boundary") {
        await setTime(m.cutoff - 1);
        await call("buy", { ...ticket, key: crypto.randomUUID() });
        await setTime(m.cutoff);
        await call("buy", { ...ticket, key: crypto.randomUUID() }, 400);
        await rejected("queued stale-created purchase rejected by DB", () =>
          q(
            "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES(?,?,?,?,?,?,?,?)",
            crypto.randomUUID(),
            before.me.id,
            round,
            "cn",
            "[1,2,3,4,5,6]",
            1,
            crypto.randomUUID(),
            m.cutoff - 1,
          ).run(),
        );
        await call("admin/collect", { round }, 409);
        return checkpoint("settle");
      }
      if (phase !== "settle") throw Error("Invalid replay phase");
      await setTime(m.ready - 1);
      await call("admin/collect", { round }, 409);
      await rejected("direct settlement before ready rejected by DB", () =>
        q("INSERT INTO settlements(round_id) VALUES(?)", round).run(),
      );
      await setTime(m.ready);
      const missing = async () => new Response("", { status: 503 });
      await rejected("source outage waits", () =>
        collectAndSettle(env, row, missing, now),
      );
      const conflicting = async (url) => {
        const r = await fetch(url);
        if (!String(url).includes("api.nasdaq.com")) return r;
        const data = await r.json();
        for (const p of data.data?.tradesTable?.rows || [])
          if (p.date === "10/29/2026") p.close = "$999.99";
        return Response.json(data);
      };
      await rejected("real-source disagreement waits", () =>
        collectAndSettle(env, row, conflicting, now),
      );
      if (
        (await q("SELECT status FROM rounds WHERE id=?", round).first())
          .status !== "open"
      )
        throw Error("Failure unexpectedly settled the round");
      const settled = await call("admin/collect", { round });
      const proof = settled.proof;
      if (
        proof.execution !== "ONLINE_REPLAY_SIMULATED_CLOCK" ||
        hash(proof.input) !== proof.seed ||
        proof.sources.length !== 3
      )
        throw Error("Bad live proof");
      const state = await call("state");
      const totalBefore = before.pool + before.me.balance;
      if (state.me.balance <= 1000)
        throw Error("Positive payout not exercised");
      if (state.pool + state.me.balance !== totalBefore)
        throw Error("Points are not conserved");
      await call("admin/collect", { round });
      const state2 = await call("state");
      if (state2.pool !== state.pool || state2.me.balance !== state.me.balance)
        throw Error("Duplicate payout");
      const downloaded = await call("proof/" + round);
      if (downloaded.seed !== proof.seed) throw Error("R2 proof mismatch");
      const result = {
        ok: true,
        environment: "ONLINE_REPLAY",
        simulatedClock: true,
        externalAnchor: "SIMULATED IN REPLAY ONLY",
        actualUpstreams: ["YahooFinance", "Nasdaq"],
        date: "2026-10-29",
        round,
        checks,
        prices: JSON.parse(proof.input).prices,
        proof,
        finalBalance: state.me.balance,
        pool: state.pool,
        completedAt: new Date().toISOString(),
      };
      await env.EVIDENCE.put(
        "replay/latest-report.json",
        JSON.stringify(result, null, 2),
      );
      return reply(result);
    } catch (e) {
      return reply(
        { ok: false, environment: "ONLINE_REPLAY", checks, error: e.message },
        500,
      );
    }
  },
};
