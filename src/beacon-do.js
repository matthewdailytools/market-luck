import { DurableObject } from "cloudflare:workers";
import { verifyBeacon } from "./beacon.js";
import { verifyWitness, witnessHash } from "./witness.js";
export class BeaconVerifier extends DurableObject {
  cache = new Map();
  async verifyWitness(receipt, record, intent) {
    if (
      typeof record !== "string" ||
      record.length > 10000 ||
      JSON.stringify(receipt || {}).length > 100000 ||
      (intent && intent.length > 20000)
    )
      return null;
    const key =
      "witness:" +
      witnessHash(JSON.stringify([receipt, record, intent || null]));
    if (this.cache.has(key)) return this.cache.get(key);
    const result = await verifyWitness(receipt, record, intent);
    if (this.cache.size >= 16)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, result);
    return result;
  }
  async verify(beacon, round) {
    if (
      !Number.isSafeInteger(round) ||
      typeof beacon?.signature !== "string" ||
      beacon.signature.length !== 96 ||
      typeof beacon.randomness !== "string" ||
      beacon.randomness.length !== 64
    )
      return false;
    const key = `${round}:${beacon.round}:${beacon.signature}:${beacon.randomness}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const valid = verifyBeacon(beacon, round);
    if (this.cache.size >= 16)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, valid);
    return valid;
  }
}
