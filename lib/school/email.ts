import { db } from "../server";
import { ApiError, bytes, decode, encode, runtime } from "./auth";
export type EmailConfig = {
  provider: "resend" | "brevo" | "mailgun";
  from: string;
  key: string;
  domain?: string;
};
async function encryptionKey() {
  const secret = (
    runtime() as ReturnType<typeof runtime> & { SCOLA_CONFIG_KEY?: string }
  ).SCOLA_CONFIG_KEY;
  if (!secret) throw new ApiError(503, "Configuration sécurisée indisponible.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(decode(secret)).buffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function emailConfig(): Promise<EmailConfig | null> {
  const row = await db()
    .prepare("SELECT value FROM school_settings WHERE key='email-connection'")
    .first<{ value: string }>();
  if (row) {
    const saved = JSON.parse(row.value) as { iv: string; encrypted: string };
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(decode(saved.iv)).buffer },
      await encryptionKey(),
      Uint8Array.from(decode(saved.encrypted)).buffer,
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const config = runtime();
  return config.EMAIL_API_KEY && config.EMAIL_FROM && config.EMAIL_PROVIDER
    ? {
        provider: config.EMAIL_PROVIDER as EmailConfig["provider"],
        from: config.EMAIL_FROM,
        key: config.EMAIL_API_KEY,
        domain: config.MAILGUN_DOMAIN,
      }
    : null;
}
export async function saveEmail(input: Record<string, unknown>) {
  const data = input.data as EmailConfig;
  if (
    !data ||
    !["resend", "brevo", "mailgun"].includes(data.provider) ||
    typeof data.from !== "string" ||
    !/^\S+@\S+\.\S+$/.test(data.from) ||
    data.from.length > 200 ||
    typeof data.key !== "string" ||
    data.key.length < 10 ||
    data.key.length > 500
  )
    throw new ApiError(400, "Service, adresse et clé API requis.");
  if (
    data.provider === "mailgun" &&
    (!data.domain || !/^[a-zA-Z0-9.-]+$/.test(data.domain))
  )
    throw new ApiError(400, "Domaine Mailgun requis.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    bytes(JSON.stringify(data)),
  );
  await db()
    .prepare(
      "INSERT INTO school_settings (key,value) VALUES ('email-connection',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(JSON.stringify({ iv: encode(iv), encrypted: encode(encrypted) }))
    .run();
  return { ok: true };
}
export async function sendEmail(
  email: string,
  subject: string,
  message: string,
) {
  const config = await emailConfig();
  if (!config)
    throw new ApiError(503, "Connectez votre service email dans Paramètres.");
  let response: Response;
  if (config.provider === "resend")
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject,
        text: message,
      }),
    });
  else if (config.provider === "brevo")
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": config.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { email: config.from },
        to: [{ email }],
        subject,
        textContent: message,
      }),
    });
  else {
    const form = new FormData();
    form.set("from", config.from);
    form.set("to", email);
    form.set("subject", subject);
    form.set("text", message);
    response = await fetch(
      `https://api.mailgun.net/v3/${config.domain}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${btoa("api:" + config.key)}` },
        body: form,
      },
    );
  }
  if (!response.ok)
    throw new ApiError(
      503,
      "Le service email a refusé l’envoi. Vérifiez la clé API et l’adresse expéditrice.",
    );
}
