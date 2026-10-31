import { DurableObject } from "cloudflare:workers";
import { verifyBeacon } from "./beacon.js";
export class BeaconVerifier extends DurableObject {
  cache = new Map();
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
