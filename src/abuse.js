export async function attemptLimit(request, env, kind, now) {
  if (!env.ABUSE_IP_KEY) {
    if (
      env.DEMO_MODE === "true" &&
      ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)
    )
      return null;
    return { error: "认证服务配置待完成，请稍后重试", status: 503 };
  }
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return { error: "无法确认请求来源，请稍后重试", status: 503 };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ABUSE_IP_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const window = kind === "register" ? 3600000 : 60000,
    end = (Math.floor(now / window) + 1) * window;
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(kind + ":" + ip + ":" + end),
      ),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  const limit = kind === "register" ? (env.DEMO_MODE === "true" ? 50 : 5) : 60;
  const row = await env.DB.prepare(
    "INSERT INTO abuse_limits(bucket,hits,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits",
  )
    .bind(hash, end, limit)
    .first();
  if (!row)
    return {
      error: "尝试次数过多，请稍后重试",
      status: 429,
      retryAfter: Math.max(1, Math.ceil((end - now) / 1000)),
    };
  return null;
}
