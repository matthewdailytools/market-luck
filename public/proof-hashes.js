// Browser-only primitives: SHA-256 uses Web Crypto. MD5 is an input fingerprint,
// never a signature or a claim that a market-data source is authentic.
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");

export async function sha256Bytes(text) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(text)),
  );
}

export async function sha256Hex(text) {
  return hex(await sha256Bytes(text));
}

export function md5Hex(text) {
  const bytes = encoder.encode(text);
  const size = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(size);
  padded.set(bytes);
  padded[bytes.length] = 128;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(size - 8, bits >>> 0, true);
  view.setUint32(size - 4, Math.floor(bits / 4294967296), true);
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0,
  );
  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;
  for (let offset = 0; offset < size; offset += 64) {
    let a = a0,
      b = b0,
      c = c0,
      d = d0;
    for (let i = 0; i < 64; i++) {
      let f, index;
      if (i < 16) {
        f = (b & c) | (~b & d);
        index = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        index = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        index = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        index = (7 * i) % 16;
      }
      const value =
        (a + f + constants[i] + view.getUint32(offset + index * 4, true)) >>> 0;
      const rotated = (value << shifts[i]) | (value >>> (32 - shifts[i]));
      [a, b, c, d] = [d, (b + rotated) >>> 0, b, c];
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const result = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((value, i) => result.setUint32(i * 4, value, true));
  return hex(new Uint8Array(result.buffer));
}
