export async function recordGuardsReady(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('entropy_no_update','payout_authorized','ticket_terms_immutable','ledger_no_delete','proof_immutable','attempts_no_update','frozen_round_no_pause','anchor_no_update','live_state_machine')",
  ).first();
  return row?.n === 9;
}
