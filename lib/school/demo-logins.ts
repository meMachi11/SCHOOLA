import { db } from "../server";
import { now, runtime } from "./auth";
import { demoId } from "./demo-marker";

const accounts = [
  ["admin", "admin"],
  ["teacher", "teacher-1"],
  ["parent", "parent-0"],
  ["student", "learner-0"],
] as const;
const marker = "demo-logins-v1-loaded";

// Only the four reserved demo accounts can receive the configured initial hashes.
// The atomic marker prevents retries from undoing password edits or deactivation.
export async function activateDemoLogins() {
  const configured = runtime().SCOLA_DEMO_LOGIN_HASHES;
  if (!configured) return;
  if (
    await db()
      .prepare("SELECT key FROM school_settings WHERE key=?")
      .bind(marker)
      .first()
  )
    return;
  const hashes = JSON.parse(configured) as Record<string, unknown>;
  for (const [role] of accounts) {
    if (
      typeof hashes[role] !== "string" ||
      !/^pbkdf2:100000:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/.test(
        hashes[role] as string,
      )
    )
      throw new Error("Invalid demo login configuration");
  }
  const rows = (
    await db()
      .prepare("SELECT id,email,role FROM school_users WHERE id IN (?,?,?,?)")
      .bind(...accounts.map(([, name]) => demoId(name)))
      .all<{ id: string; email: string; role: string }>()
  ).results;
  if (
    !accounts.every(([role, name]) =>
      rows.some(
        (r) =>
          r.id === demoId(name) &&
          r.email === name + "@scola.example.test" &&
          r.role === role,
      ),
    )
  )
    return;
  await db().batch([
    ...accounts.map(([role, name]) =>
      db()
        .prepare(
          "UPDATE school_users SET password_hash=? WHERE id=? AND email=? AND role=? AND active=1 AND identity_id IS NULL AND password_hash IS NULL AND NOT EXISTS(SELECT 1 FROM school_settings WHERE key=?)",
        )
        .bind(
          hashes[role] as string,
          demoId(name),
          name + "@scola.example.test",
          role,
          marker,
        ),
    ),
    db()
      .prepare(
        "INSERT INTO school_audit (id,actor_id,action,target,created) SELECT ?,'system','demo.logins.activate','four reserved demo accounts',? WHERE NOT EXISTS(SELECT 1 FROM school_settings WHERE key=?)",
      )
      .bind(demoId("audit-logins"), now(), marker),
    db()
      .prepare("INSERT OR IGNORE INTO school_settings (key,value) VALUES (?,?)")
      .bind(marker, JSON.stringify({ created: now() })),
  ]);
}
