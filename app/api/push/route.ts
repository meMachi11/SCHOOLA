import { db } from "../../../lib/server";
import {
  ApiError,
  body,
  checkOrigin,
  json,
  requireUser,
  responseError,
} from "../../../lib/school/auth";
import { allowedEndpoint, pushUser, vapid } from "../../../lib/school/push";
export async function GET(req: Request) {
  try {
    await requireUser(req);
    return json({ publicKey: (await vapid()).publicKey });
  } catch (e) {
    return responseError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(req);
    const input = await body(req);
    if (input.action === "test")
      return json(
        await pushUser(
          user.id,
          "Scola",
          "Les notifications sont activées. / الإشعارات مفعلة.",
          "notifications",
        ),
      );
    const subscription = input.subscription as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (
      !subscription?.endpoint ||
      !allowedEndpoint(subscription.endpoint) ||
      subscription.endpoint.length > 2048 ||
      !subscription.keys?.p256dh ||
      !subscription.keys.auth ||
      !/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys.p256dh) ||
      !/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys.auth)
    )
      throw new ApiError(400, "Abonnement push invalide.");
    const old = await db()
      .prepare("SELECT user_id FROM school_push WHERE endpoint=?")
      .bind(subscription.endpoint)
      .first<{ user_id: string }>();
    if (old && old.user_id !== user.id)
      throw new ApiError(
        403,
        "Désactivez les notifications de l’ancien compte avant de changer de compte.",
      );
    await db()
      .prepare(
        "INSERT INTO school_push (endpoint,user_id,p256dh,auth) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth",
      )
      .bind(
        subscription.endpoint,
        user.id,
        subscription.keys.p256dh,
        subscription.keys.auth,
      )
      .run();
    return json({ ok: true });
  } catch (e) {
    return responseError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(req);
    const endpoint = new URL(req.url).searchParams.get("endpoint");
    if (!endpoint) return json({ ok: true });
    await db()
      .prepare("DELETE FROM school_push WHERE user_id=? AND endpoint=?")
      .bind(user.id, endpoint)
      .run();
    return json({ ok: true });
  } catch (e) {
    return responseError(e);
  }
}
