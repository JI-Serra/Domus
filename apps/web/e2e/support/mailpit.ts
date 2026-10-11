/** Client for the local mail catcher (Mailpit/Inbucket API) that receives every auth email. */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface MessageSummary {
  ID: string;
  Created: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok)
    throw new Error(`Mailpit ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

/** Waits for the newest email sent to `recipient` and returns its plain-text body. */
export async function waitForEmailText(recipient: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const { messages } = await getJson<{ messages: MessageSummary[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
    );
    const newest = messages[0];
    if (newest) {
      const detail = await getJson<{ Text: string }>(
        `/api/v1/message/${newest.ID}`,
      );
      return detail.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email arrived for ${recipient} within 20 s`);
}

/** The auth-server link inside an email (magic link or recovery). */
export function extractAuthLink(emailText: string): string {
  const match = /https?:\/\/[^\s<>"]+\/auth\/v1\/verify\?[^\s<>"]+/.exec(
    emailText,
  );
  if (!match) throw new Error('No auth link found in the email');
  return match[0].replaceAll('&amp;', '&');
}

/**
 * Waits for an email to `recipient` that arrived after `since` (so an older email to the same address, such as the
 * sign-up confirmation, is never mistaken for the one the test is waiting for) and returns its plain-text body.
 */
export async function waitForEmailTextSince(
  recipient: string,
  since: Date,
): Promise<string> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const { messages } = await getJson<{ messages: MessageSummary[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
    );
    const fresh = messages.find(
      (message) => new Date(message.Created).getTime() >= since.getTime(),
    );
    if (fresh) {
      const detail = await getJson<{ Text: string }>(
        `/api/v1/message/${fresh.ID}`,
      );
      return detail.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No new email arrived for ${recipient} within 25 s`);
}
