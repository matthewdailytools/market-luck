import { games, hash, validate } from "./engine.js";
import { settle } from "./settle.js";
import { prepareLiveManifest, collectAndSettle } from "./live.js";
import { verifyPublication } from "./publication.js";
import { assertLockedRound } from "./calendar.js";
import { publicConsensus } from "./public-market-data.js";
import { attemptLimit } from "./abuse.js";
import { readSnapshot, verifyOnServer, BEACON_VECTOR } from "./entropy.js";
import { RANDOMNESS_POLICY, beaconTime } from "./beacon.js";
import { recordGuardsReady } from "./record-guards.js";
const json = (v, status = 200, headers = {}) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
const stmt = (e, s, ...a) => e.DB.prepare(s).bind(...a);
async function readJson(req) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("INVALID_JSON");
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      const error = Error("请求过大");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function password(p, s) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode(s),
          iterations: 100000,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function user(req, e, now) {
  const t = (req.headers.get("cookie") || "").match(
    /(?:^|;\s*)session=([a-f0-9]+)/,
  )?.[1];
  return t
    ? stmt(
        e,
        "SELECT u.id,u.name,u.balance FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        t,
        now,
      ).first()
    : null;
}
async function createRound(e, clock = Date.now) {
  const now = clock(),
    id = crypto.randomUUID();
  const manifest = {
    version: 1,
    id,
    mode: "DEMO",
    price: 10,
    games,
    cutoff: now + 900000,
    ready: now + 960000,
    sources: ["FIXTURE-v1"],
    markets: [
      {
        symbol: "XNAS:AAPL",
        currency: "USD",
        scale: 2,
        date: new Date(now).toISOString().slice(0, 10),
        closeUTC: now + 930000,
      },
      {
        symbol: "XSHG:600519",
        currency: "CNY",
        scale: 2,
        date: new Date(now).toISOString().slice(0, 10),
        closeUTC: now + 930000,
      },
    ],
    payout: [50, 30, 20],
    missing: "wait",
  };
  await stmt(
    e,
    "INSERT INTO rounds(id,manifest,commitment,cutoff,ready) VALUES(?,?,?,?,?)",
    id,
    JSON.stringify(manifest),
    hash(JSON.stringify(manifest)),
    manifest.cutoff,
    manifest.ready,
  ).run();
  return id;
}
export function createWorker(clock = Date.now) {
  return {
    async fetch(req, e) {
      try {
        const u = new URL(req.url),
          p = u.pathname;
        if (!p.startsWith("/api/")) {
          const res = await e.ASSETS.fetch(req);
          const h = new Headers(res.headers);
          h.set(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          );
          h.set("X-Content-Type-Options", "nosniff");
          return new Response(res.body, { status: res.status, headers: h });
        }
        if (
          req.method === "POST" &&
          !p.startsWith("/api/admin/") &&
          req.headers.get("origin") !== u.origin
        )
          return json({ error: "来源校验失败" }, 403);
        if (
          req.method === "POST" &&
          Number(req.headers.get("content-length")) > 16384
        )
          return json({ error: "请求过大" }, 413);
        if (p === "/api/randomness-health" && req.method === "GET") {
          if (!e.BEACON_VERIFIER)
            return json(
              { ready: false, error: "BEACON_VERIFIER_UNAVAILABLE" },
              503,
            );
          const valid = await verifyOnServer(e, BEACON_VECTOR, 1000);
          const invalid = await verifyOnServer(
            e,
            { ...BEACON_VECTOR, round: 1001 },
            1001,
          );
          const guards = await recordGuardsReady(e);
          const authReady =
            Boolean(e.ABUSE_IP_KEY) ||
            (e.DEMO_MODE === "true" &&
              ["localhost", "127.0.0.1"].includes(u.hostname));
          const ready = valid && !invalid && guards && authReady;
          return json(
            {
              ready,
              recordGuardsInstalled: guards,
              installedAlgorithms: [1, 2],
              newRoundVersion: 2,
              verification: "SQLite Durable Object BLS",
              historicalSelfTest: {
                round: 1000,
                validAccepted: valid,
                tamperRejected: !invalid,
              },
              abuseProtectionConfigured: Boolean(e.ABUSE_IP_KEY),
              policy: RANDOMNESS_POLICY,
            },
            ready ? 200 : 503,
          );
        }

        if (p.startsWith("/api/admin/") && req.method === "POST") {
          if (
            !e.ADMIN_TOKEN ||
            req.headers.get("authorization") !== "Bearer " + e.ADMIN_TOKEN
          )
            return json({ error: "需要管理员凭据" }, 401);

          if (p === "/api/admin/check-public-sources") {
            const b = await readJson(req);
            const result = await publicConsensus(b.symbol, b.date);
            for (const o of result.observations)
              await e.EVIDENCE.put(
                `research/${b.symbol}/${b.date}/${o.provider}/${o.sha256}.json`,
                o.raw,
              );
            return json(
              {
                ...result,
                observations: result.observations.map(({ raw, ...o }) => o),
              },
              result.ok ? 200 : 409,
            );
          }
          if (p === "/api/admin/prepare") {
            if (!(await recordGuardsReady(e)))
              return json({ error: "RECORD_GUARDS_UNAVAILABLE" }, 503);
            if (
              !e.BEACON_VERIFIER ||
              !(await verifyOnServer(e, BEACON_VECTOR, 1000))
            )
              return json({ error: "BEACON_VERIFIER_UNAVAILABLE" }, 503);
            const m = prepareLiveManifest(await readJson(req), clock());
            await stmt(
              e,
              "INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status) VALUES(?,?,?,?,?,'draft')",
              m.id,
              JSON.stringify(m),
              hash(JSON.stringify(m)),
              m.cutoff,
              m.ready,
            ).run();
            return json({
              manifest: m,
              commitment: hash(JSON.stringify(m)),
              next: "在外部发布承诺后调用 /api/admin/publish",
            });
          }
          const b = await readJson(req);
          const r = await stmt(
            e,
            "SELECT * FROM rounds WHERE id=?",
            b.round,
          ).first();
          if (!r) return json({ error: "期次不存在" }, 404);
          if (p === "/api/admin/publish") {
            try {
              if (r.status !== "draft" || clock() >= r.cutoff)
                return json({ error: "无法发布" }, 409);
              if (
                typeof b.anchor !== "string" ||
                !b.anchor.startsWith("https://")
              )
                return json({ error: "需要外部承诺记录 HTTPS 链接" }, 400);
              assertLockedRound(r, clock());
              if (
                JSON.parse(r.manifest).version === 2 &&
                !(await verifyOnServer(e, BEACON_VECTOR, 1000))
              )
                throw Error("BEACON_VERIFIER_UNAVAILABLE");
              await verifyPublication(
                b.anchor,
                r.commitment,
                e.COMMITMENT_REPOSITORY,
              );
              if (clock() >= r.cutoff) return json({ error: "已停售" }, 409);
              await e.DB.batch([
                stmt(
                  e,
                  "INSERT INTO anchors(round_id,url,published,verified_hash,verified_at) VALUES(?,?,?,?,?)",
                  r.id,
                  b.anchor,
                  clock(),
                  r.commitment,
                  clock(),
                ),
                stmt(
                  e,
                  "UPDATE rounds SET status='open' WHERE id=? AND status='draft'",
                  r.id,
                ),
              ]);
              return json({ ok: true });
            } catch (error) {
              return json(
                { error: "PUBLICATION_FAILED", detail: error.message },
                409,
              );
            }
          }
          if (p === "/api/admin/pause") {
            if (
              JSON.parse(r.manifest).version === 2 &&
              (await readSnapshot(e, r.id))
            )
              return json({ error: "FROZEN_ROUND_CANNOT_PAUSE" }, 409);
            if (r.status !== "open")
              return json({ error: "期次不可暂停" }, 409);
            await e.DB.batch([
              stmt(
                e,
                "UPDATE rounds SET status='paused' WHERE id=? AND status='open'",
                r.id,
              ),
              stmt(
                e,
                "INSERT INTO collection_attempts(round_id,attempted,ok,reason) SELECT ?,?,0,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='paused')",
                r.id,
                clock(),
                "ADMIN_PAUSE: " +
                  (typeof b.reason === "string"
                    ? b.reason.slice(0, 200)
                    : "No reason supplied"),
                r.id,
              ),
            ]);
            return json({ ok: true });
          }
          if (p === "/api/admin/collect") {
            if (r.status !== "open" && r.status !== "settled")
              return json({ error: "期次未发布" }, 409);
            try {
              const proof = await collectAndSettle(e, r, fetch, clock());
              await stmt(
                e,
                "INSERT INTO collection_attempts(round_id,attempted,ok,reason) VALUES(?,?,1,?)",
                r.id,
                clock(),
                "CONSENSUS",
              ).run();
              return json({ ok: true, proof });
            } catch (error) {
              await stmt(
                e,
                "INSERT INTO collection_attempts(round_id,attempted,ok,reason) VALUES(?,?,0,?)",
                r.id,
                clock(),
                error.message,
              ).run();
              return json({ error: error.message, waiting: true }, 409);
            }
          }
        }
        const roundResource = p.match(
          /^\/api\/round\/([A-Za-z0-9-]{1,80})(\/manifest|\/entropy)?$/,
        );
        if (roundResource && req.method === "GET") {
          const row = await stmt(
            e,
            "SELECT id,status,manifest,commitment,cutoff,ready,proof FROM rounds WHERE id=? AND status!='draft'",
            roundResource[1],
          ).first();
          if (!row) return json({ error: "期次不存在或尚未公开" }, 404);
          if (roundResource[2] === "/entropy") {
            const snapshot =
              JSON.parse(row.manifest).version === 2
                ? await readSnapshot(e, row.id)
                : null;
            return json({
              roundId: row.id,
              version: JSON.parse(row.manifest).version,
              snapshot,
              beaconTime: snapshot ? beaconTime(snapshot.beaconRound) : null,
            });
          }
          if (roundResource[2] === "/manifest")
            return new Response(row.manifest, {
              headers: {
                "content-type": "application/json; charset=utf-8",
                "content-disposition": `attachment; filename="manifest-${row.id}.json"`,
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
              },
            });
          const [anchor, attempts] = await Promise.all([
            stmt(
              e,
              "SELECT round_id,url,published,verified_hash,verified_at FROM anchors WHERE round_id=?",
              row.id,
            ).first(),
            stmt(
              e,
              "SELECT attempted,ok,reason FROM collection_attempts WHERE round_id=? ORDER BY id DESC LIMIT 10",
              row.id,
            ).all(),
          ]);
          return json({
            serverTime: clock(),
            demo: e.DEMO_MODE === "true",
            round: {
              ...row,
              manifest: JSON.parse(row.manifest),
              proof: row.proof ? JSON.parse(row.proof) : null,
            },
            anchor,
            attempts: attempts.results,
          });
        }
        const me = await user(req, e, clock());
        if (p === "/api/state" && req.method === "GET") {
          const rounds = (
            await stmt(
              e,
              "SELECT * FROM rounds WHERE status!='draft' ORDER BY rowid DESC LIMIT 20",
            ).all()
          ).results;
          return json({
            me,
            serverTime: clock(),
            games,
            demo: e.DEMO_MODE === "true",
            autoDraw: e.DEMO_AUTO_DRAW === "true",
            pool: (await stmt(e, "SELECT balance FROM pool WHERE id=1").first())
              .balance,
            anchors: (
              await stmt(
                e,
                "SELECT * FROM anchors ORDER BY published DESC LIMIT 20",
              ).all()
            ).results,
            attempts: (
              await stmt(
                e,
                "SELECT * FROM collection_attempts ORDER BY id DESC LIMIT 30",
              ).all()
            ).results,
            rounds: rounds
              .filter((r) => r.status !== "draft")
              .map((r) => ({
                ...r,
                manifest: JSON.parse(r.manifest),
                proof: r.proof ? JSON.parse(r.proof) : null,
              })),
            tickets: me
              ? (
                  await stmt(
                    e,
                    "SELECT * FROM tickets WHERE user_id=? ORDER BY rowid DESC LIMIT 100",
                    me.id,
                  ).all()
                ).results
              : [],
            winners: (
              await stmt(
                e,
                "SELECT id,user_id,round_id,game,prize,tier FROM tickets WHERE prize>0 ORDER BY rowid DESC LIMIT 100",
              ).all()
            ).results,
            ledger: (
              await stmt(
                e,
                "SELECT id,round_id,kind,delta,created FROM ledger WHERE kind!='signup' ORDER BY id DESC LIMIT 100",
              ).all()
            ).results,
          });
        }
        if (
          ["/api/register", "/api/login"].includes(p) &&
          req.method === "POST"
        ) {
          const limited = await attemptLimit(
            req,
            e,
            p.endsWith("register") ? "register" : "login",
            clock(),
          );
          if (limited)
            return json(
              { error: limited.error },
              limited.status,
              limited.retryAfter
                ? { "retry-after": String(limited.retryAfter) }
                : {},
            );
          const b = await readJson(req);
          if (
            typeof b.name !== "string" ||
            !/^[\p{L}\p{N}_-]{3,24}$/u.test(b.name) ||
            typeof b.password !== "string" ||
            b.password.length < 8 ||
            b.password.length > 128
          )
            return json({ error: "用户名需 3–24 字，密码需 8–128 字" }, 400);
          let id;
          if (p.endsWith("register")) {
            id = crypto.randomUUID();
            const salt = crypto.randomUUID();
            await stmt(
              e,
              "INSERT INTO users(id,name,password,salt) VALUES(?,?,?,?)",
              id,
              b.name,
              await password(b.password, salt),
              salt,
            ).run();
          } else {
            const a = await stmt(
              e,
              "SELECT * FROM users WHERE name=?",
              b.name,
            ).first();
            if (!a || a.password !== (await password(b.password, a.salt)))
              return json({ error: "用户名或密码错误" }, 401);
            id = a.id;
          }
          const token = Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
            (x) => x.toString(16).padStart(2, "0"),
          ).join("");
          await stmt(
            e,
            "INSERT INTO sessions VALUES(?,?,?)",
            token,
            id,
            clock() + 604800000,
          ).run();
          return json({ ok: true }, 200, {
            "set-cookie": `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${u.protocol === "https:" ? "; Secure" : ""}`,
          });
        }
        if (p === "/api/logout" && req.method === "POST") {
          const token = (req.headers.get("cookie") || "").match(
            /session=([a-f0-9]+)/,
          )?.[1];
          if (token)
            await stmt(e, "DELETE FROM sessions WHERE token=?", token).run();
          return json({ ok: true }, 200, {
            "set-cookie":
              "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          });
        }
        if (p === "/api/buy" && req.method === "POST") {
          if (!me) return json({ error: "请先登录" }, 401);
          const b = await readJson(req);
          validate(b.game, b.main, b.bonus);
          if (
            typeof b.key !== "string" ||
            !/^[a-zA-Z0-9-]{8,80}$/.test(b.key) ||
            typeof b.round !== "string"
          )
            return json({ error: "无效请求" }, 400);
          const old = await stmt(
            e,
            "SELECT * FROM tickets WHERE user_id=? AND request_key=?",
            me.id,
            b.key,
          ).first();
          if (old) return json({ ok: true, id: old.id, replayed: true });
          const roundConfig = await stmt(
            e,
            "SELECT * FROM rounds WHERE id=?",
            b.round,
          ).first();
          if (!roundConfig) return json({ error: "期次不存在" }, 404);
          if (JSON.parse(roundConfig.manifest).mode === "LIVE") {
            if (hash(roundConfig.manifest) !== roundConfig.commitment)
              throw Error("COMMITMENT_MISMATCH");
            assertLockedRound(roundConfig, clock());
          }
          validate(
            b.game,
            b.main,
            b.bonus,
            JSON.parse(roundConfig.manifest).games,
          );
          const id = crypto.randomUUID();
          await stmt(
            e,
            "INSERT INTO tickets(id,user_id,round_id,game,numbers,bonus,request_key,created) VALUES(?,?,?,?,?,?,?,?)",
            id,
            me.id,
            b.round,
            b.game,
            JSON.stringify([...b.main].sort((a, b) => a - b)),
            b.bonus,
            b.key,
            clock(),
          ).run();
          return json({ ok: true, id });
        }
        if (p.startsWith("/api/proof/") && req.method === "GET") {
          const r = await stmt(
            e,
            "SELECT id,proof FROM rounds WHERE id=? AND status='settled'",
            p.split("/").pop(),
          ).first();
          if (!r) return json({ error: "证据尚未发布" }, 404);
          const o =
            (await e.EVIDENCE.get(
              JSON.parse(r.proof).evidenceKey ||
                `${r.id}/${JSON.parse(r.proof).seed}.json`,
            )) || (await e.EVIDENCE.get(`${r.id}.json`));
          return o
            ? new Response(o.body, {
                headers: {
                  "content-type": "application/json",
                  "content-disposition": `attachment; filename="${r.id}.json"`,
                },
              })
            : json({ error: "证据暂不可用" }, 503);
        }
        if (p.startsWith("/api/demo/") && req.method === "POST") {
          if (
            e.DEMO_MODE !== "true" ||
            (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
              (!e.ADMIN_TOKEN ||
                req.headers.get("authorization") !== "Bearer " + e.ADMIN_TOKEN))
          )
            return json({ error: "仅本地演示可用" }, 403);
          if (p === "/api/demo/create") {
            const existing = await stmt(
              e,
              "SELECT id FROM rounds WHERE status='open'",
            ).first();
            return json({ id: existing?.id || (await createRound(e, clock)) });
          }
          const b = await readJson(req);
          const r = await stmt(
            e,
            "SELECT * FROM rounds WHERE id=?",
            b.round,
          ).first();
          if (!r) return json({ error: "期次不存在" }, 404);
          if (JSON.parse(r.manifest).mode !== "DEMO")
            return json({ error: "不能操作真实期次" }, 403);
          if (p === "/api/demo/advance") {
            if (r.status !== "open") return json({ error: "期次已结算" }, 409);
            await stmt(
              e,
              "UPDATE rounds SET cutoff=?,ready=? WHERE id=?",
              clock() - 2000,
              clock() - 1000,
              r.id,
            ).run();
            return json({
              ok: true,
              note: "模拟时钟推进，不改变已锁定 manifest",
            });
          }
          if (p === "/api/demo/draw") {
            if (r.status === "settled")
              return json({ ok: true, replayed: true });
            if (clock() < r.ready || clock() < r.cutoff)
              return json({ error: "未到收盘确认时间" }, 409);
            const m = JSON.parse(r.manifest),
              prices = m.markets.map((x, i) => ({
                ...x,
                close:
                  10000 +
                  (parseInt(hash(r.id + ":" + i).slice(0, 6), 16) % 100000),
              }));
            return json({
              ok: true,
              proof: await settle(
                e,
                r,
                prices,
                { simulatedClock: true },
                clock(),
              ),
            });
          }
        }
        return json({ error: "接口不存在" }, 404);
      } catch (err) {
        if (err.status === 413) return json({ error: "请求过大" }, 413);
        const msg = String(err.message);
        return json(
          {
            error: msg.includes("UNIQUE")
              ? "重复请求或用户名已存在"
              : msg.includes("积分不足")
                ? "积分不足"
                : msg.includes("已停售")
                  ? "已停售"
                  : msg.includes("号码")
                    ? "号码格式不正确"
                    : "请求无法完成",
          },
          400,
        );
      }
    },
    async scheduled(event, e, ctx) {
      ctx.waitUntil(
        (async () => {
          await stmt(
            e,
            "DELETE FROM abuse_limits WHERE expires<?",
            clock() - 86400000,
          ).run();
          const rows = (
            await stmt(
              e,
              "SELECT * FROM rounds WHERE status='open' AND ready<=?",
              clock(),
            ).all()
          ).results;
          for (const r of rows) {
            const manifest = JSON.parse(r.manifest);
            if (
              manifest.mode === "DEMO" &&
              e.DEMO_MODE === "true" &&
              e.DEMO_AUTO_DRAW === "true"
            ) {
              const prices = manifest.markets.map((x, i) => ({
                ...x,
                close:
                  10000 +
                  (parseInt(hash(r.id + ":" + i).slice(0, 6), 16) % 100000),
              }));
              try {
                await settle(e, r, prices, { simulatedClock: true }, clock());
              } catch {
                console.log("Demo settlement waiting", r.id);
              }
              continue;
            }
            if (manifest.mode !== "LIVE") continue;
            try {
              await collectAndSettle(e, r, fetch, clock());
              await stmt(
                e,
                "INSERT INTO collection_attempts(round_id,attempted,ok,reason) VALUES(?,?,1,?)",
                r.id,
                clock(),
                "CONSENSUS",
              ).run();
            } catch {
              await stmt(
                e,
                "INSERT INTO collection_attempts(round_id,attempted,ok,reason) VALUES(?,?,0,?)",
                r.id,
                clock(),
                "WAITING_FOR_CONSENSUS",
              ).run();
            }
          }
          if (e.DEMO_MODE === "true" && e.DEMO_AUTO_DRAW === "true") {
            const open = await stmt(
              e,
              "SELECT id FROM rounds WHERE status='open'",
            ).first();
            if (!open) await createRound(e, clock);
          }
        })(),
      );
    },
  };
}
export default createWorker();
