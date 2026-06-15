import { createHash, randomBytes, randomUUID } from "node:crypto";

export function isoNowZ(): string {
  return new Date().toISOString();
}

export function uuid7Str(): string {
  const ms = BigInt(Date.now());
  const rand = randomBytes(10);
  const randA = ((rand[0] << 4) | (rand[1] >> 4)) & 0x0fff;
  let randB = BigInt(rand[1] & 0x0f);
  for (const b of rand.slice(2)) randB = (randB << 8n) | BigInt(b);
  return formatUuid7(ms, randA, randB);
}

export function deterministicUuid7(seed: string, tsIso: string): string {
  const ms = BigInt(Date.parse(tsIso || new Date().toISOString()));
  const h = createHash("sha256").update(seed).digest();
  const randA = ((h[0] << 4) | (h[1] >> 4)) & 0x0fff;
  let randB = BigInt(h[1] & 0x0f);
  for (const b of h.slice(2, 10)) randB = (randB << 8n) | BigInt(b);
  return formatUuid7(ms, randA, randB);
}

export function deterministicUuid4(seed: string): string {
  const b = Buffer.from(createHash("md5").update(seed).digest());
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

export function uuid4Str(): string {
  return randomUUID();
}

function formatUuid7(ms: bigint, randA: number, randB: bigint): string {
  const value =
    ((ms & 0xffffffffffffn) << 80n) |
    (0x7n << 76n) |
    (BigInt(randA) << 64n) |
    (0x2n << 62n) |
    (randB & 0x3fffffffffffffffn);
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bytesToUuid(b: Buffer): string {
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

