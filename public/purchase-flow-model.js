// These checks support review screens. The server remains authoritative for sales.
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const safeId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value);
const safeGameId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value);
const validTime = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
const safeBalance = (value) => Number.isSafeInteger(value) && value >= 0;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function validGame(game) {
  return (
    record(game) &&
    safeGameId(game.id) &&
    Number.isSafeInteger(game.count) &&
    game.count > 0 &&
    game.count <= 100 &&
    Number.isSafeInteger(game.max) &&
    game.max >= game.count &&
    game.max <= 1000000 &&
    Number.isSafeInteger(game.bonus) &&
    game.bonus >= 0 &&
    game.bonus <= 1000000 &&
    Number.isSafeInteger(game.bonusMin ?? 1) &&
    (game.bonusMin ?? 1) >= 0 &&
    Number.isSafeInteger((game.bonusMin ?? 1) + game.bonus)
  );
}

function draftShape(draft) {
  return (
    record(draft) &&
    safeId(draft.round) &&
    safeGameId(draft.game) &&
    Array.isArray(draft.main) &&
    draft.main.length > 0 &&
    draft.main.length <= 100 &&
    draft.main.every((number) => Number.isSafeInteger(number) && number > 0) &&
    new Set(draft.main).size === draft.main.length &&
    (draft.bonus === null ||
      (Number.isSafeInteger(draft.bonus) && draft.bonus >= 0)) &&
    draft.price === 10 &&
    validTime(draft.cutoff) &&
    typeof draft.contextKey === "string" &&
    draft.contextKey.length > 0
  );
}

const sorted = (numbers) => [...numbers].sort((a, b) => a - b);
const sameNumbers = (a, b) => {
  if (a.length !== b.length) return false;
  const right = sorted(b);
  return sorted(a).every((number, i) => number === right[i]);
};

/** Valid selections can be reviewed before sign-in; only ready drafts can submit. */
export function validatePurchaseDraft({
  state,
  gameId,
  main = [],
  bonus = null,
  now,
} = {}) {
  const result = {
    phase: "loading",
    canReview: false,
    canSubmit: false,
    draft: null,
    game: null,
    balance: safeBalance(state?.me?.balance) ? state.me.balance : null,
    missingMain: 0,
    missingBonus: false,
  };
  const finish = (phase) => ({
    ...result,
    phase,
    canSubmit: phase === "ready",
  });
  if (!record(state)) return finish("loading");
  if (!Array.isArray(state.rounds)) return finish("malformed-round");
  const open = state.rounds.filter((round) => round?.status === "open");
  if (!open.length) return finish("no-round");
  if (open.length !== 1) return finish("malformed-round");
  const round = open[0];
  const manifest = round.manifest;
  if (
    !safeId(round.id) ||
    !record(manifest) ||
    manifest.id !== round.id ||
    !["LIVE", "DEMO"].includes(manifest.mode) ||
    !validTime(round.cutoff) ||
    !Number.isFinite(now) ||
    now < 0 ||
    // The D1 trigger currently charges exactly 10 points, in both modes.
    !Number.isSafeInteger(manifest.price) ||
    manifest.price !== 10
  )
    return finish("malformed-round");
  const catalog = manifest.games;
  if (
    !Array.isArray(catalog) ||
    !catalog.length ||
    !catalog.every(validGame) ||
    new Set(catalog.map((game) => game.id)).size !== catalog.length
  )
    return finish("malformed-round");
  if (now >= round.cutoff) return finish("closed");
  const game = catalog.find((item) => item.id === gameId);
  if (!game) return finish("choose");
  result.game = Object.freeze({
    id: game.id,
    name: typeof game.name === "string" ? game.name : game.id,
    flag: typeof game.flag === "string" ? game.flag : "",
    count: game.count,
    max: game.max,
    bonus: game.bonus,
    bonusMin: game.bonusMin ?? 1,
  });
  result.missingMain = Math.max(
    0,
    game.count - (Array.isArray(main) ? main.length : 0),
  );
  result.missingBonus = Boolean(game.bonus && bonus === null);
  const min = game.bonusMin ?? 1;
  if (
    !Array.isArray(main) ||
    main.length !== game.count ||
    new Set(main).size !== game.count ||
    main.some(
      (number) =>
        !Number.isSafeInteger(number) || number < 1 || number > game.max,
    ) ||
    (game.bonus
      ? !Number.isSafeInteger(bonus) || bonus < min || bonus >= min + game.bonus
      : bonus !== null)
  )
    return finish("incomplete");
  result.canReview = true;
  result.draft = Object.freeze({
    round: round.id,
    game: game.id,
    main: Object.freeze(sorted(main)),
    bonus,
    price: manifest.price,
    cutoff: round.cutoff,
    contextKey: JSON.stringify(
      canonical({
        round: round.id,
        cutoff: round.cutoff,
        commitment: round.commitment ?? null,
        manifest,
      }),
    ),
  });
  if (!record(state.me) || !safeId(state.me.id)) return finish("auth");
  if (result.balance === null || result.balance < manifest.price)
    return finish("insufficient");
  return finish("ready");
}

/** Compare ticket intent after refreshing state; never replace an earlier draft silently. */
export function sameDraft(a, b) {
  return Boolean(
    draftShape(a) &&
    draftShape(b) &&
    a.contextKey === b.contextKey &&
    a.round === b.round &&
    a.game === b.game &&
    a.price === b.price &&
    a.cutoff === b.cutoff &&
    a.bonus === b.bonus &&
    sameNumbers(a.main, b.main),
  );
}

/** An accepted API response alone does not prove the returned ticket's contents. */
export function validatePurchaseReceipt(response, draft) {
  if (
    !record(response) ||
    response.ok !== true ||
    !safeId(response.id) ||
    response.error !== undefined ||
    (response.replayed !== undefined &&
      typeof response.replayed !== "boolean") ||
    !draftShape(draft)
  )
    return null;
  // Copy and freeze even if a caller supplied a mutable, structurally valid draft.
  const intent = Object.freeze({
    ...draft,
    main: Object.freeze(sorted(draft.main)),
  });
  return Object.freeze({
    id: response.id,
    replayed: response.replayed === true,
    draft: intent,
  });
}

/** Confirm ownership and exact intent against tickets returned by a fresh /api/state. */
export function findConfirmedTicket(state, receipt) {
  if (
    !record(state) ||
    !record(state.me) ||
    !safeId(state.me.id) ||
    !Array.isArray(state.tickets) ||
    !record(receipt) ||
    !safeId(receipt.id) ||
    !draftShape(receipt.draft)
  )
    return null;
  const ticket = state.tickets.find((item) => item?.id === receipt.id);
  const draft = receipt.draft;
  if (
    !ticket ||
    ticket.user_id !== state.me.id ||
    ticket.round_id !== draft.round ||
    ticket.game !== draft.game ||
    ticket.bonus !== draft.bonus
  )
    return null;
  let main;
  try {
    main =
      typeof ticket.numbers === "string" ? JSON.parse(ticket.numbers) : null;
  } catch {
    return null;
  }
  if (
    !Array.isArray(main) ||
    main.some((number) => !Number.isSafeInteger(number)) ||
    !sameNumbers(main, draft.main)
  )
    return null;
  return Object.freeze({
    id: ticket.id,
    round: ticket.round_id,
    game: ticket.game,
    main: Object.freeze(sorted(main)),
    bonus: ticket.bonus,
    created: validTime(ticket.created) ? ticket.created : null,
  });
}
