// Explicit temporary remote-preview entry point. Not imported by src/entry.js.
// It has no D1/R2/round access and only writes a labelled public readiness event.
import {
  jcs,
  makeWitnessIntent,
  submitWitness,
  verifyWitness,
} from "../src/witness.js";
export default {
  async fetch(request, env) {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/probe" ||
      !env.PROBE_TOKEN ||
      request.headers.get("authorization") !== "Bearer " + env.PROBE_TOKEN
    )
      return new Response("Not found", { status: 404 });
    try {
      const record = jcs({
        domain: "market-luck/cloud-worker-witness-readiness/v3",
        purpose:
          "temporary Cloudflare remote-preview cryptographic transport test; no lottery round",
        testId: crypto.randomUUID(),
      });
      const intent = await makeWitnessIntent(record),
        receipt = await submitWitness(record, intent),
        checked = await verifyWitness(receipt, record, intent);
      return Response.json(
        {
          status: "passed",
          execution: "Cloudflare remote preview; no lottery or D1/R2 writes",
          receipt,
          verified: checked,
        },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      return Response.json({ error: error.message }, { status: 503 });
    }
  },
};
