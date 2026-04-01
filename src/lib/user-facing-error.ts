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

  return m;
}
