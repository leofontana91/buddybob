import { randomBytes } from "crypto";

import { publicAppUrl } from "./appUrl";

export function newActivationToken(): string {
  return randomBytes(32).toString("hex");
}

export function newPasswordResetToken(): string {
  return `rst_${randomBytes(32).toString("hex")}`;
}

export function isPasswordResetToken(token: string): boolean {
  return token.startsWith("rst_");
}

function resendFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "BOB Robotics <noreply@buddybob.app>"
  );
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean; mailError?: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return { sent: false, mailError: "RESEND_API_KEY non impostata su Vercel" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (res.ok) return { sent: true };
    const details = await res.text();
    console.error("Resend failed", details);
    let message = details.slice(0, 400);
    try {
      const json = JSON.parse(details) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      /* keep raw */
    }
    return { sent: false, mailError: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Resend error", e);
    return { sent: false, mailError: message };
  }
}

/**
 * Local/dev: logs activation link (also returned to Super Admin UI).
 * Production: set RESEND_API_KEY. Optional RESEND_FROM after verifying the domain.
 */
export async function sendActivationEmail(opts: {
  to: string;
  companyName: string;
  personName: string;
  token: string;
  baseUrl?: string;
}): Promise<{ sent: boolean; activationUrl: string; mailError?: string }> {
  const base = (opts.baseUrl ?? publicAppUrl()).replace(/\/$/, "");
  const activationUrl = `${base}/activate?token=${encodeURIComponent(opts.token)}`;

  const subject = "Attiva il tuo account BOB Admin";
  const text = [
    `Ciao ${opts.personName},`,
    "",
    `Il Super Admin ha creato l'account azienda per ${opts.companyName}.`,
    "Per completare la registrazione e scegliere la password apri questo link:",
    activationUrl,
    "",
    "Il link scade tra 72 ore.",
    "",
    "— BOB Robotics",
  ].join("\n");

  const result = await sendResendEmail({ to: opts.to, subject, text });
  return { ...result, activationUrl };
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  personName: string;
  token: string;
  baseUrl?: string;
}): Promise<{ sent: boolean; resetUrl: string; mailError?: string }> {
  const base = (opts.baseUrl ?? publicAppUrl()).replace(/\/$/, "");
  const resetUrl = `${base}/reset?token=${encodeURIComponent(opts.token)}`;

  const subject = "Reimposta la password BOB";
  const text = [
    `Ciao ${opts.personName},`,
    "",
    "Hai richiesto di reimpostare la password del tuo account BOB.",
    "Apri questo link per scegliere una nuova password:",
    resetUrl,
    "",
    "Il link scade tra 2 ore. Se non hai richiesto tu il reset, ignora questa email.",
    "",
    "— BOB Robotics",
  ].join("\n");

  const result = await sendResendEmail({ to: opts.to, subject, text });
  return { ...result, resetUrl };
}
