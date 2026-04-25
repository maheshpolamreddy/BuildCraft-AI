import {
  estimateTokensFromMessages,
  getAssumedContextWindowTokens,
  MAX_PROJECT_DESCRIPTION_CHARS,
} from "@/lib/ai-limits";

export type ChatMsgLike = { role?: string; content?: string | null };

const MAX_SYSTEM_CHARS = 14_000;
const MAX_USER_CHARS = 10_000;
const MAX_ASSISTANT_CHARS = 8_000;

export function normalizeOpenAiChatParams<T extends { messages?: ChatMsgLike[] }>(params: T): T {
  if (!params.messages?.length) return params;
  const messages = params.messages.map((m) => {
    const role = (m.role ?? "user").toLowerCase();
    let cap = MAX_USER_CHARS;
    if (role === "system") cap = MAX_SYSTEM_CHARS;
    else if (role === "assistant") cap = MAX_ASSISTANT_CHARS;
    const c = typeof m.content === "string" ? m.content : "";
    const s = c.length > cap ? `${c.slice(0, cap)}\n\n[truncated for safe context]` : c;
    return { ...m, content: s };
  });
  return { ...params, messages };
}

export function normalizeAnalyzeTextInputs(projectName: string, projectIdea: string): { name: string; idea: string } {
  const name = (projectName || "My App").trim().slice(0, 220);
  const idea = projectIdea.trim().slice(0, MAX_PROJECT_DESCRIPTION_CHARS);
  return { name, idea };
}

const CTX_RESERVE_TOKENS = 2_800;

export function trimMessagesForContext(messages: ChatMsgLike[]): ChatMsgLike[] {
  const ctx = getAssumedContextWindowTokens();
  let m = [...messages];
  let guard = 0;
  while (m.length > 1 && estimateTokensFromMessages(m as never) > ctx - CTX_RESERVE_TOKENS && guard++ < 24) {
    const dropAt = m.findIndex((x, i) => i > 0 && (x.role ?? "").toLowerCase() !== "system");
    if (dropAt === -1) break;
    m = m.filter((_, i) => i !== dropAt);
  }
  if (estimateTokensFromMessages(m as never) > ctx - CTX_RESERVE_TOKENS) {
    const last = m[m.length - 1];
    if (last && typeof last.content === "string" && last.content.length > 2_000) {
      m = m.slice();
      m[m.length - 1] = {
        ...last,
        content: `${last.content.slice(0, 2_000)}\n\n[truncated]`,
      };
    }
  }
  return m;
}

export function assertSafeContextOrThrow(messages: ChatMsgLike[]): void {
  const est = estimateTokensFromMessages(messages as never);
  const ctx = getAssumedContextWindowTokens();
  if (est > ctx - 512) {
    throw new Error("AI_INPUT_CONTEXT_EXCEEDED");
  }
}