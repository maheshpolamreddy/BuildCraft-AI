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

  if (/^402\b|\b402\b|payment|more credits|fewer max_tokens|can only afford|quota/i.test(m)) {
    return "Optimizing under current usage limits. Try again in a moment.";
  }

  if (/invalid JSON|Analysis step|missing overview|unexpected format|ANALYSIS_PHASE|No JSON|Optimizing/i.test(m)) {
    return "Optimizing results. If this does not clear in a few seconds, try again.";
  }

  if (/openai|openrouter|anthropic|api key|status code|50[0-4]|internal server error/i.test(m)) {
    return "Optimizing your request. Please try again.";
  }

  return m;
}
