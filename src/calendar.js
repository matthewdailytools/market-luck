// Reviewed against Nasdaq Trader and NYSE 2026 calendars. Unknown years fail closed.
export const CALENDAR_VERSION = "US-EQUITIES-2026-v1";
const holidays = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);
const early = new Set(["2026-11-27", "2026-12-24"]);
export const CONFIRMATION_MS = 86400000;
function localUTC(date, hour, minute = 0) {
  const target = Date.parse(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(target));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const displayed = Date.parse(
    `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
  );
  return target + (target - displayed);
}
export function sessionFor(date) {
  if (
    !/^2026-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("CALENDAR_UNSUPPORTED_DATE");
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  if (weekday === 0 || weekday === 6 || holidays.has(date))
    throw Error("MARKET_CLOSED_DATE");
  return {
    date,
    timeZone: "America/New_York",
    calendarVersion: CALENDAR_VERSION,
    preMarketUTC: localUTC(date, 4),
    cutoff: localUTC(date, 3, 30),
    openUTC: localUTC(date, 9, 30),
    closeUTC: localUTC(date, early.has(date) ? 13 : 16),
    earlyClose: early.has(date),
  };
}
export function assertLockedRound(round, now, { forCollection = false } = {}) {
  const m = JSON.parse(round.manifest);
  if (m.mode !== "LIVE") return m;
  const maxClose = Math.max(...m.markets.map((p) => p.closeUTC));
  if (
    m.id !== round.id ||
    m.calendarVersion !== CALENDAR_VERSION ||
    m.confirmationDelayMs !== CONFIRMATION_MS ||
    round.cutoff !== m.cutoff ||
    round.ready !== m.ready ||
    m.ready !== maxClose + CONFIRMATION_MS ||
    m.cutoff >= Math.min(...m.markets.map((p) => p.openUTC))
  )
    throw Error("LOCKED_TIMING_MISMATCH");
  for (const p of m.markets) {
    const s = sessionFor(p.date);
    if (
      p.openUTC !== s.openUTC ||
      p.closeUTC !== s.closeUTC ||
      m.cutoff > s.cutoff
    )
      throw Error("CALENDAR_MISMATCH");
  }
  if (
    forCollection &&
    (round.status !== "open" || now < m.cutoff || now < m.ready)
  )
    throw Error("MARKETS_NOT_FINAL");
  return m;
}
