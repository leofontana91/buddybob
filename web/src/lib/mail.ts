import { randomBytes } from "crypto";

import { publicAppUrl } from "./appUrl";

/**
 * Local/dev: logs activation link (also returned to Super Admin UI).
 * Production: set RESEND_API_KEY to send mail; otherwise Super Admin copies the URL.
 */
export async function sendActivationEmail(opts: {
  to: string;
  companyName: string;
  personName: string;
  token: string;
  baseUrl?: string;
}): Promise<{ sent: boolean; activationUrl: string }> {
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

  // Optional: Resend API if RESEND_API_KEY is set
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM ?? "BOB <onboarding@resend.dev>",
          to: opts.to,
          subject,
          text,
        }),
      });
      if (res.ok) return { sent: true, activationUrl };
      console.error("Resend failed", await res.text());
    } catch (e) {
      console.error("Resend error", e);
    }
  }

  console.log("\n=== ACTIVATION EMAIL (dev) ===");
  console.log(`To: ${opts.to}`);
  console.log(`Subject: ${subject}`);
  console.log(text);
  console.log("==============================\n");

  return { sent: false, activationUrl };
}

export function newActivationToken(): string {
  return randomBytes(32).toString("hex");
}
