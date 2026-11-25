import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { AppError } from "../errors";
import type { Actor } from "../rbac";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detect the type from magic bytes; the client-declared type is not trusted. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

interface Driver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const localDriver: Driver = {
  async put(key, data) {
    const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || (process.env.VERCEL ? "/tmp/stockflow-uploads" : ".uploads"));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(/* turbopackIgnore: true */ dir, key), data, { mode: 0o600 });
  },
  async get(key) {
    const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || (process.env.VERCEL ? "/tmp/stockflow-uploads" : ".uploads"));
    const p = path.join(/* turbopackIgnore: true */ dir, key);
    if (!p.startsWith(dir + path.sep)) throw new AppError("not_found", {}, 404);
    return readFile(p);
  },
};

/**
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO) using SigV4 via fetch so no SDK is
 * required. Configure S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 */
const s3Driver: Driver = {
  async put(key, data, mime) {
    const res = await s3Request("PUT", key, data, mime);
    if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
  },
  async get(key) {
    const res = await s3Request("GET", key);
    if (!res.ok) throw new AppError("not_found", {}, 404);
    return Buffer.from(await res.arrayBuffer());
  },
};

async function s3Request(method: "GET" | "PUT", key: string, body?: Buffer, mime?: string) {
  const { createHash, createHmac } = await import("node:crypto");
  const endpoint = (process.env.S3_ENDPOINT || `https://s3.${process.env.S3_REGION}.amazonaws.com`).replace(/\/$/, "");
  const region = process.env.S3_REGION || "auto";
  const bucket = process.env.S3_BUCKET!;
  const url = new URL(`${endpoint}/${bucket}/${encodeURIComponent(key)}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body ?? "").digest("hex");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (mime) headers["content-type"] = mime;
  const signed = Object.keys(headers).sort();
  const canonical = [method, url.pathname, "", ...signed.map((h) => `${h}:${headers[h]}`), "", signed.join(";"), payloadHash].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${process.env.S3_SECRET_ACCESS_KEY}`, date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`;
  const { host: _h, ...rest } = headers;
  void _h;
  return fetch(url, { method, headers: { ...rest, Authorization: auth }, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(30000) });
}

function driver(): Driver {
  return process.env.UPLOAD_DRIVER === "s3" ? s3Driver : localDriver;
}

export function storageStatus() {
  if (process.env.UPLOAD_DRIVER === "s3") {
    const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !process.env[k]);
    return { driver: "s3", configured: missing.length === 0, missing };
  }
  return { driver: "local", configured: true, missing: [] as string[] };
}

export async function saveUpload(actor: Actor, file: { name: string; data: Buffer }, opts: { branchId?: string | null; imagesOnly?: boolean } = {}) {
  if (file.data.length === 0) throw new AppError("file_empty");
  if (file.data.length > MAX_UPLOAD_BYTES) throw new AppError("file_too_large", { mb: 5 });
  const mime = sniffMime(file.data);
  if (!mime || (opts.imagesOnly && !mime.startsWith("image/"))) throw new AppError("file_type_not_allowed");
  const key = `${new Date().toISOString().slice(0, 7)}-${randomBytes(18).toString("hex")}.${EXT[mime]}`;
  await driver().put(key, file.data, mime);
  const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || `file.${EXT[mime]}`;
  return db.attachment.create({
    data: { storageKey: key, fileName: safeName, mimeType: mime, size: file.data.length, uploadedById: actor.id, branchId: opts.branchId ?? actor.primaryBranchId ?? null },
  });
}

export async function readUpload(storageKey: string) {
  return driver().get(storageKey);
}
