/**
 * Human-friendly dates: "Today", "Yesterday", and clear calendar strings.
 * All formatting uses the user's locale (Intl / toLocale*).
 */

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Firestore Timestamp, { seconds }, Date, epoch ms, or epoch seconds. */
export function parseToDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number" && Number.isFinite(input)) {
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "object" && input !== null) {
    const o = input as { toMillis?: () => number; seconds?: number };
    if (typeof o.toMillis === "function") {
      const d = new Date(o.toMillis());
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof o.seconds === "number") {
      const d = new Date(o.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/**
 * Date-only label: "Today", "Yesterday", or a short locale date (e.g. "Jan 8" / "8 Jan").
 */
export function formatDateBadge(date: Date, now = new Date()): string {
  if (isSameCalendarDay(date, now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isSameCalendarDay(date, y)) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/**
 * Full date + time for activity rows (audit, "last update", etc.).
 * Example: "Today, 3:45 PM", "Yesterday, 9:12 AM", "Jan 5, 2024, 2:30 PM"
 */
export function formatDateTimeSmart(date: Date, now = new Date()): string {
  const dayPart = formatDateBadge(date, now);
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dayPart}, ${timePart}`;
}

/**
 * Chat bubble footer: emphasizes Today/Yesterday, then time.
 * Same calendar day as `now`: time only.
 */
export function formatChatMessageTime(date: Date, now = new Date()): string {
  if (isSameCalendarDay(date, now)) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isSameCalendarDay(date, y)) {
    return `Yesterday ${date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const dStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `${dStr} ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** "Sent today" / "Sent yesterday" / "Sent 8 Jan 2025" */
export function formatSentPrefix(date: Date, now = new Date()): string {
  const badge = formatDateBadge(date, now);
  if (badge === "Today" || badge === "Yesterday") return `Sent ${badge.toLowerCase()}`;
  return `Sent ${badge}`;
}

/** "Expires today" / "Expires tomorrow" / "Expires 10 Jan" - for deadlines. */
export function formatExpiresLabel(date: Date, now = new Date()): string {
  if (isSameCalendarDay(date, now)) return "Expires today";
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  if (isSameCalendarDay(date, t)) return "Expires tomorrow";
  const sameYear = date.getFullYear() === now.getFullYear();
  const dStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `Expires ${dStr}`;
}

/** "Joined today" / "Joined yesterday" / "Joined 5 Jan 2024" */
export function formatJoinedPrefix(date: Date, now = new Date()): string {
  const badge = formatDateBadge(date, now);
  if (badge === "Today" || badge === "Yesterday") return `Joined ${badge.toLowerCase()}`;
  return `Joined ${badge}`;
}

/**
 * Past Projects list: show when the project was created. Prefer `createdAt`; if missing (session
 * placeholder row or legacy docs), use `updatedAt` so new projects still show a sensible date.
 */
export function formatProjectListDateBadge(saved: {
  createdAt?: unknown;
  updatedAt?: unknown;
}): string {
  const created = parseToDate(saved.createdAt);
  if (created) return formatDateBadge(created);
  const updated = parseToDate(saved.updatedAt);
  if (updated) return formatDateBadge(updated);
  return "—";
}