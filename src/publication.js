import { hash } from "./engine.js";
export async function verifyPublication(
  url,
  expected,
  repository = "matthewdailytools/market-luck",
  fetcher = fetch,
) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw Error("INVALID_PUBLICATION_REPOSITORY");
  const u = new URL(url),
    prefix = "/" + repository + "/";
  if (
    u.protocol !== "https:" ||
    u.hostname !== "raw.githubusercontent.com" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !u.pathname.startsWith(prefix) ||
    !/^[a-f0-9]{40}\/commitments\/[a-zA-Z0-9-]+\.json$/.test(
      u.pathname.slice(prefix.length),
    )
  )
    throw Error("IMMUTABLE_PUBLICATION_URL_REQUIRED");
  // Workers supports manual/follow, not redirect:error. Do not follow any redirect.
  const r = await fetcher(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (r.status !== 200) throw Error("PUBLICATION_NOT_AVAILABLE");
  const raw = await r.text();
  if (raw.length > 32768 || hash(raw) !== expected)
    throw Error("PUBLICATION_HASH_MISMATCH");
  return { hash: expected, url };
}
