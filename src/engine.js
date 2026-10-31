import { md5 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalV2, seedV2 } from "./beacon.js";
export const games = [
  { id: "cn", name: "中国 · 双星", flag: "🇨🇳", count: 6, max: 33, bonus: 16 },
  { id: "us", name: "美国 · 超级球", flag: "🇺🇸", count: 5, max: 69, bonus: 26 },
  { id: "uk", name: "英国 · 六重奏", flag: "🇬🇧", count: 6, max: 59, bonus: 0 },
  { id: "jp", name: "日本 · 六之幸", flag: "🇯🇵", count: 6, max: 43, bonus: 0 },
  {
    id: "fr",
    name: "法国 · 幸运星",
    flag: "🇫🇷",
    count: 5,
    max: 49,
    bonus: 10,
    minMatch: 2,
  },
  {
    id: "de",
    name: "德国 · 超级数",
    flag: "🇩🇪",
    count: 6,
    max: 49,
    bonus: 10,
    bonusMin: 0,
  },
  {
    id: "it",
    name: "意大利 · 九十之选",
    flag: "🇮🇹",
    count: 6,
    max: 90,
    bonus: 0,
    minMatch: 2,
  },
  {
    id: "es",
    name: "西班牙 · 原野六",
    flag: "🇪🇸",
    count: 6,
    max: 49,
    bonus: 0,
  },
  {
    id: "ca",
    name: "加拿大 · 枫叶六",
    flag: "🇨🇦",
    count: 6,
    max: 49,
    bonus: 0,
  },
  {
    id: "au",
    name: "澳大利亚 · 南十字七",
    flag: "🇦🇺",
    count: 7,
    max: 47,
    bonus: 0,
  },
  {
    id: "nz",
    name: "新西兰 · 云帆六",
    flag: "🇳🇿",
    count: 6,
    max: 40,
    bonus: 0,
  },
  {
    id: "kr",
    name: "韩国 · 四五之约",
    flag: "🇰🇷",
    count: 6,
    max: 45,
    bonus: 0,
  },
  {
    id: "sg",
    name: "新加坡 · 狮城六",
    flag: "🇸🇬",
    count: 6,
    max: 49,
    bonus: 0,
  },
  {
    id: "br",
    name: "巴西 · 森林六",
    flag: "🇧🇷",
    count: 6,
    max: 60,
    bonus: 0,
    minMatch: 4,
  },
  { id: "za", name: "南非 · 彩虹六", flag: "🇿🇦", count: 6, max: 52, bonus: 0 },
  {
    id: "ph",
    name: "菲律宾 · 群岛六",
    flag: "🇵🇭",
    count: 6,
    max: 58,
    bonus: 0,
  },
];
export const hash = (s) => bytesToHex(sha256(utf8ToBytes(s)));
export function canonical(round, commitment, prices) {
  return JSON.stringify({
    version: 1,
    round,
    commitment,
    prices: [...prices]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
      .map((p) => ({
        symbol: p.symbol,
        date: p.date,
        currency: p.currency,
        scale: p.scale,
        close: p.close,
      })),
  });
}
export function draw(seed, g) {
  let counter = 0,
    words = [];
  const uniform = (n) => {
    let x;
    const limit = Math.floor(4294967296 / n) * n;
    do {
      if (!words.length) {
        const b = sha256(utf8ToBytes(`${seed}:${g.id}:${counter++}`));
        const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
        words = Array.from({ length: 8 }, (_, i) => v.getUint32(i * 4));
      }
      x = words.shift();
    } while (x >= limit);
    return x % n;
  };
  const pool = Array.from({ length: g.max }, (_, i) => i + 1),
    main = [];
  for (let i = 0; i < g.count; i++) {
    const j = uniform(pool.length);
    main.push(pool.splice(j, 1)[0]);
  }
  return {
    main: main.sort((a, b) => a - b),
    bonus: g.bonus ? uniform(g.bonus) + (g.bonusMin ?? 1) : null,
  };
}
export function tier(ticket, result, g = {}) {
  const hits = ticket.main.filter((x) => result.main.includes(x)).length;
  const special = result.bonus === null || ticket.bonus === result.bonus;
  if (hits === result.main.length && special) return 1;
  if (hits === result.main.length - 1 && special) return 2;
  if (hits >= (g.minMatch ?? 3) || (result.bonus !== null && special)) return 3;
  return 0;
}
export function validate(game, main, bonus, catalog = games) {
  const g = catalog.find((g) => g.id === game);
  const min = g?.bonusMin ?? 1;
  if (
    !g ||
    !Array.isArray(main) ||
    main.length !== g.count ||
    new Set(main).size !== g.count ||
    main.some((n) => !Number.isInteger(n) || n < 1 || n > g.max) ||
    (g.bonus
      ? !Number.isInteger(bonus) || bonus < min || bonus >= min + g.bonus
      : bonus !== null)
  )
    throw Error("号码格式不正确");
  return g;
}
export function evidence(round, prices, entropy = {}) {
  const manifest = JSON.parse(round.manifest);
  const version = manifest.version ?? 1;
  if (![1, 2].includes(version)) throw Error("UNSUPPORTED_ALGORITHM_VERSION");
  const input =
    manifest.version === 2
      ? canonicalV2(
          round.id,
          round.commitment,
          prices,
          entropy.snapshot,
          entropy.beacon,
        )
      : canonical(round.id, round.commitment, prices);
  const seed = manifest.version === 2 ? seedV2(input) : hash(input);
  return {
    version,
    mode: manifest.version === 2 ? manifest.mode : "DEMO",
    manifest,
    commitment: round.commitment,
    input,
    md5: bytesToHex(md5(utf8ToBytes(input))),
    seed,
    results: Object.fromEntries(
      (manifest.games ?? games).map((g) => [g.id, draw(seed, g)]),
    ),
    ...(manifest.version === 2
      ? { snapshot: entropy.snapshot, beacon: entropy.beacon }
      : {}),
  };
}
