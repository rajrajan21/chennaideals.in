import { getSecret } from "#airo/secrets";

type ResendMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send a transactional email through Resend.
 * Configure RESEND_API_KEY and RESEND_FROM_EMAIL in the local secret/env setup.
 * Never expose the API key to browser code.
 */
export async function sendResendEmail(message: ResendMessage): Promise<void> {
  const apiKey = getSecret("RESEND_API_KEY");
  const from = getSecret("RESEND_FROM_EMAIL");

  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!from || typeof from !== "string" || !from.includes("@")) {
    throw new Error("RESEND_FROM_EMAIL is not configured (example: ChennaiDeals.in <no-reply@chennaideals.in>)");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error("Resend email request failed", {
      status: response.status,
      body: responseText.slice(0, 500),
    });
    throw new Error(`Resend email request failed with status ${response.status}`);
  }
}
