import assert from "node:assert/strict";
import { sessionFor } from "../src/calendar.js";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
assert(
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),
  "This mutating check is localhost only",
);
let session;
for (let day = 0; day < 15; day++) {
  const date = new Date(Date.now() + day * 86400000).toISOString().slice(0, 10);
  try {
    const s = sessionFor(date);
    if (s.cutoff > Date.now() + 3600000) {
      session = s;
      break;
    }
  } catch {}
}
assert(session, "A reviewed future trading date is required");
const body = {
  markets: ["AAPL", "MSFT"].map((t) => ({
    symbol: "XNAS:" + t,
    date: session.date,
    currency: "USD",
    scale: 2,
  })),
  cutoff: session.cutoff,
};
const call = (value) =>
  fetch(base + "/api/admin/prepare", {
    method: "POST",
    headers: {
      Authorization: "Bearer local-v3-only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
const old = await call({ ...body, version: 2 });
assert.equal(old.status, 400);
const fake = await call({ ...body, nonce: "0".repeat(64) });
assert.equal(fake.status, 400);
const response = await call(body);
assert.equal(response.status, 200, await response.clone().text());
const value = await response.json();
assert.equal(value.manifest.version, 3);
assert.match(value.manifest.hidden.md5, /^[a-f0-9]{32}$/);
assert.match(value.manifest.hidden.sha256, /^[a-f0-9]{64}$/);
assert(!JSON.stringify(value).includes("ciphertext"));
assert(!JSON.stringify(value).includes('"nonce":'));
for (const suffix of ["", "/entropy", "/witnesses", "/manifest"])
  assert.equal(
    (await fetch(base + "/api/round/" + value.manifest.id + suffix)).status,
    404,
  );
console.log(
  JSON.stringify({
    status: "passed",
    execution: "localhost real workerd/D1/DO",
    checks: 8,
    version: 3,
    privateDraft: true,
  }),
);
