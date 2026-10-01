import { bucket, db } from "../../../lib/server";
import {
  ApiError,
  audit,
  checkOrigin,
  json,
  now,
  requireUser,
  responseError,
} from "../../../lib/school/auth";
import { allRecords } from "../../../lib/school/store";
import { canRead, canWrite } from "../../../lib/school/policy";
export async function GET(req: Request) {
  try {
    const user = await requireUser(req),
      records = await allRecords(),
      url = new URL(req.url),
      id = url.searchParams.get("id");
    if (id) {
      const file = await db()
        .prepare("SELECT * FROM school_files WHERE id=?")
        .bind(id)
        .first<{ id: string; record_id: string; name: string; type: string }>();
      if (!file) throw new ApiError(404, "Document introuvable.");
      const record = records.find((r) => r.id === file.record_id);
      if (!record || !canRead(user, record, records))
        throw new ApiError(403, "Accès non autorisé.");
      const object = await bucket().get(id);
      if (!object) throw new ApiError(404, "Document introuvable.");
      return new Response(object.body, {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const recordId =
      url.searchParams.get("record") ?? url.searchParams.get("student");
    const record = records.find((r) => r.id === recordId);
    if (!record || !canRead(user, record, records))
      throw new ApiError(403, "Accès non autorisé.");
    return json(
      (
        await db()
          .prepare(
            "SELECT id,name,type,size,created FROM school_files WHERE record_id=? ORDER BY created DESC",
          )
          .bind(record.id)
          .all()
      ).results,
    );
  } catch (e) {
    return responseError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(req);
    if (Number(req.headers.get("content-length") ?? 0) > 6 * 1024 * 1024)
      throw new ApiError(413, "5 Mo maximum.");
    const form = await req.formData(),
      file = form.get("file"),
      recordId = form.get("record") ?? form.get("student");
    const records = await allRecords(),
      record = records.find((r) => r.id === recordId);
    if (
      !record ||
      !canRead(user, record, records) ||
      (!canWrite(user, record.kind, record.data, records) &&
        !(record.kind === "students" && user.role === "parent"))
    )
      throw new ApiError(403, "Ajout de document non autorisé.");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    )
      throw new ApiError(400, "PDF, JPG ou PNG, 5 Mo maximum.");
    const bytes = await file.arrayBuffer(),
      b = new Uint8Array(bytes);
    const valid =
      file.type === "application/pdf"
        ? new TextDecoder().decode(b.slice(0, 5)) === "%PDF-"
        : file.type === "image/jpeg"
          ? b[0] === 255 && b[1] === 216 && b[2] === 255
          : [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n);
    if (!valid) throw new ApiError(400, "Contenu de fichier invalide.");
    const id = crypto.randomUUID();
    await bucket().put(id, bytes, { httpMetadata: { contentType: file.type } });
    try {
      const saved = await db()
        .prepare(
          "INSERT INTO school_files (id,record_id,kind,name,type,size,created,author_id) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM school_files WHERE record_id=?)<10",
        )
        .bind(
          id,
          record.id,
          record.kind,
          file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200),
          file.type,
          file.size,
          now(),
          user.id,
          record.id,
        )
        .run();
      if (!saved.meta.changes)
        throw new ApiError(400, "10 documents maximum par dossier.");
    } catch (e) {
      await bucket().delete(id);
      throw e;
    }
    await audit(user.id, "file.upload", id);
    return json({ id });
  } catch (e) {
    return responseError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(req),
      id = new URL(req.url).searchParams.get("id");
    const file = await db()
      .prepare("SELECT * FROM school_files WHERE id=?")
      .bind(id)
      .first<{ record_id: string; author_id: string }>();
    if (!file) throw new ApiError(404, "Document introuvable.");
    const records = await allRecords(),
      record = records.find((r) => r.id === file.record_id);
    if (
      !record ||
      !canRead(user, record, records) ||
      (user.role !== "admin" && file.author_id !== user.id)
    )
      throw new ApiError(403, "Suppression non autorisée.");
    await bucket().delete(id!);
    await db().prepare("DELETE FROM school_files WHERE id=?").bind(id).run();
    await audit(user.id, "file.delete", id!);
    return json({ ok: true });
  } catch (e) {
    return responseError(e);
  }
}
