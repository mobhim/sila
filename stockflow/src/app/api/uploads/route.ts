import { api } from "@/server/api";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/auth/rate-limit";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/server/storage";

/** POST multipart (field "file"). Returns the attachment id to reference in a form. */
export async function POST(req: Request) {
  return api(async (actor) => {
    if (!(await rateLimit(`upload:${actor.id}`, 30, 600))) throw new AppError("rate_limited", {}, 429);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new AppError("file_too_large", { mb: 5 }, 413);
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) throw new AppError("file_empty");
    const att = await saveUpload(actor, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, { imagesOnly: fd.get("imagesOnly") === "1" });
    return { id: att.id, fileName: att.fileName, mimeType: att.mimeType, size: att.size };
  });
}
