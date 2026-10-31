import { selectDisplayRound, describeHomeRound } from "./round-summary.js";
import { describeHomeHighlights } from "./home-highlights-model.js";
import { shareCopy, shareLanguage } from "./share-copy.js";

export const validShareRound = (id) =>
  typeof id === "string" && /^[A-Za-z0-9-]{1,80}$/.test(id);
export const validShareGame = (id) =>
  typeof id === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(id);

export function roundSharePath(id, game = "cn", language = "zh-CN") {
  if (!validShareRound(id) || !validShareGame(game)) return null;
  return (
    "/share.html?" +
    new URLSearchParams({ round: id, game, lang: shareLanguage(language) })
  );
}

/** Public round only. Never includes account, ticket or balance data. */
export function describeRoundShare(
  data,
  requestedGame,
  language,
  now,
  verification = null,
) {
  const lang = shareLanguage(language),
    words = shareCopy[lang],
    round = data?.round;
  if (
    !validShareRound(round?.id) ||
    round.manifest?.id !== round.id ||
    !["LIVE", "DEMO"].includes(round.manifest?.mode) ||
    !["open", "paused", "settled"].includes(round.status) ||
    !Number.isSafeInteger(round.cutoff) ||
    !Number.isSafeInteger(round.ready) ||
    round.cutoff <= 0 ||
    round.cutoff >= round.ready ||
    round.manifest.cutoff !== round.cutoff ||
    round.manifest.ready !== round.ready
  )
    return null;
  const state = {
    rounds: [round],
    games: round.manifest.games,
    demo: data.demo === true,
  };
  const highlights = describeHomeHighlights(state, lang);
  const options = highlights.formats;
  // A supplied unknown format is an error, never silently another format.
  const game =
    requestedGame === null
      ? options[0]
      : options.find((g) => g.id === requestedGame);
  if (!game) return null;
  const timing = describeHomeRound(state, now, lang, "Asia/Shanghai");
  const mode = highlights.active.mode;
  const verified = round.status === "settled" && verification?.ok === true;
  const result = verified
    ? highlights.recent.games.find((g) => g.id === game.id)
    : null;
  const phase =
    round.status === "settled"
      ? verification === null
        ? "checking"
        : result
          ? "passed"
          : "failed"
      : timing.phase;
  return {
    id: round.id,
    language: lang,
    mode,
    modeLabel: words.mode[mode],
    game,
    options,
    phase,
    phaseLabel: words.phases[phase] || words.phases.unavailable,
    cutoff: timing.cutoffText,
    ready: timing.readyText,
    message:
      phase === "passed"
        ? words.checked
        : phase === "failed"
          ? words.failed
          : words.pending,
    main: result?.main || [],
    bonus: result?.bonus ?? null,
    sources: Array.isArray(round.manifest.sources)
      ? round.manifest.sources
          .filter((s) => typeof s === "string" && s.length < 100)
          .join(" + ")
      : words.unavailable,
    path: roundSharePath(round.id, game.id, lang),
    audit: "/verify.html?round=" + encodeURIComponent(round.id),
    // A verified result or a clearly pending round can be exported. Failed proof cannot.
    canExport:
      phase !== "checking" &&
      phase !== "failed" &&
      phase !== "unavailable" &&
      Boolean(words.mode[mode]),
  };
}

export function defaultShareRound(state) {
  return selectDisplayRound(state?.rounds);
}
