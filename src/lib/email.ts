// Transactional email through Resend's HTTP API (free plan; no SDK dependency).
// Without RESEND_API_KEY the message is written to the server log instead: handy locally, and in production
// the owner can still read a reset link from the Vercel logs before email is configured.
type Email = { to: string; subject: string; text: string; html: string };

export async function sendEmail({ to, subject, text, html }: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[email] RESEND_API_KEY is not set, so this email was not sent.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Everyday <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
      html
    })
  });
  if (!response.ok) {
    throw new Error(`Email could not be sent (Resend ${response.status}): ${await response.text()}`);
  }
}

export function passwordResetEmail(name: string, url: string) {
  const subject = "Reset your Everyday password";
  const text = `Hi ${name},\n\nOpen this link to choose a new password. It works once and expires in 1 hour:\n${url}\n\nIf you didn't ask for this, ignore this email; your password stays the same.`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Open this link to choose a new password. It works once and expires in 1 hour:</p><p><a href="${escapeHtml(url)}">Choose a new password</a></p><p>If you didn't ask for this, ignore this email; your password stays the same.</p>`;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}
