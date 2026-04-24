/**
 * Browser fetch() failures and mapped server errors — user-friendly copy for the UI.
 */
export function getUserFacingError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Something went wrong. Please try again.";
  }
  const m = err.message;

  if (/failed to fetch|networkerror|load failed|aborted|connection problem/i.test(m)) {
    return "Connection problem — check your network, VPN, or firewall. If the dev server was restarting, try again.";
  }

  if (/^402\b|\b402\b|payment required|more credits|fewer max_tokens|can only afford/i.test(m)) {
    return (
      "AI credits or token limit: add balance at your provider (e.g. OpenRouter), or lower AI_MAX_COMPLETION_TOKENS in .env.local, then retry."
    );
  }

  return m;
}
