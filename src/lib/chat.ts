/**
 * Firestore real-time chat helpers.
 *
 * Collection: chats/{chatId}/messages/{msgId}
 * chatId = hireToken (shared between creator and developer)
 *
 * chats/{chatId}:
 *   { chatId, projectName, creatorUid, creatorName, creatorEmail,
 *     developerUid, developerName, developerEmail, createdAt,
 *     lastMessage, lastMessageAt, lastSenderUid }
 *
 * messages subcollection:
 *   { id, text, senderUid, senderName, sentAt, read: boolean }
 */

import { db } from "./firebase";
import {
  doc, setDoc, getDoc, updateDoc, addDoc,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp,
  Timestamp,
  deleteField,
  type Unsubscribe,
} from "firebase/firestore";

export interface ChatMessage {
  id:         string;
  text:       string;
  senderUid:  string;
  senderName: string;
  sentAt:     { seconds: number } | null;
  read:       boolean;
}

/** Normalize Firestore Timestamp / plain object for UI */
export function normalizeChatMessage(id: string, raw: Record<string, unknown>): ChatMessage {
  const sent = raw.sentAt;
  let sentAt: { seconds: number } | null = null;
  if (sent instanceof Timestamp) {
    sentAt = { seconds: sent.seconds };
  } else if (sent && typeof sent === "object" && "seconds" in sent && typeof (sent as { seconds: unknown }).seconds === "number") {
    sentAt = { seconds: (sent as { seconds: number }).seconds };
  }
  return {
    id,
    text:       typeof raw.text === "string" ? raw.text : "",
    senderUid:  typeof raw.senderUid === "string" ? raw.senderUid.trim() : String(raw.senderUid ?? "").trim(),
    senderName: typeof raw.senderName === "string" ? raw.senderName.trim() : String(raw.senderName ?? "").trim(),
    sentAt,
    read:       Boolean(raw.read),
  };
}

/** Compare Firestore `senderUid` to the viewer’s Firebase uid (trimmed strings). */
export function isOwnChatMessage(msg: Pick<ChatMessage, "senderUid">, viewerUid: string | null | undefined): boolean {
  const a = String(msg.senderUid ?? "").trim();
  const b = String(viewerUid ?? "").trim();
  return Boolean(a && b && a === b);
}

/**
 * Classify bubble side + label using viewer uid and chat room parties (fixes wrong “You” when uid/store drift).
 */
export function classifyChatBubble(
  msg: ChatMessage,
  viewerUid: string,
  room: ChatRoom | null,
): { isMine: boolean; label: string } {
  const s = (msg.senderUid || "").trim();
  const me = (viewerUid || "").trim();
  if (me && s && s === me) {
    return { isMine: true, label: "You" };
  }
  const cUid = (room?.creatorUid || "").trim();
  const dUid = (room?.developerUid || "").trim();
  if (s && cUid && s === cUid) {
    return {
      isMine: me === cUid,
      label: (room?.creatorName || "").trim() || "Project creator",
    };
  }
  if (s && dUid && s === dUid) {
    return {
      isMine: me === dUid,
      label: (room?.developerName || "").trim() || "Developer",
    };
  }
  const name = (msg.senderName || "").trim();
  return { isMine: false, label: name || "Teammate" };
}

export function chatStorageKey(role: "creator" | "developer", uid: string): string {
  return `buildcraft:activeChat:${role}:${uid}`;
}

export interface ChatRoom {
  chatId:         string;
  projectName:    string;
  creatorUid:     string;
  creatorName:    string;
  creatorEmail:   string;
  developerUid:   string;
  developerName:  string;
  developerEmail: string;
  lastMessage:    string;
  lastMessageAt:  unknown;
  lastSenderUid:  string;
  createdAt:      unknown;
  /** Presence — updated when each party has the chat tab open */
  creatorLastSeenAt?:   unknown;
  developerLastSeenAt?: unknown;
  /** Shown to the other party when they open chat (set if sender messaged while recipient looked offline). */
  offlinePingForCreator?:   string;
  offlinePingForDeveloper?: string;
}

const OFFLINE_PING_AFTER_MS = 3 * 60 * 1000;

export function firestoreTimestampMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof value === "object" && "seconds" in value && typeof (value as { seconds: unknown }).seconds === "number") {
    return (value as { seconds: number }).seconds * 1000;
  }
  return null;
}

/** Call while the user is viewing this thread (e.g. chat tab focused). */
export async function updateChatPresence(chatId: string, viewerUid: string): Promise<void> {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return;
  const d = snap.data() as ChatRoom;
  const field =
    d.creatorUid === viewerUid ? "creatorLastSeenAt" : d.developerUid === viewerUid ? "developerLastSeenAt" : null;
  if (!field) return;
  await updateDoc(doc(db, "chats", chatId), { [field]: serverTimestamp() });
}

export async function clearOfflinePing(chatId: string, which: "creator" | "developer"): Promise<void> {
  const key = which === "creator" ? "offlinePingForCreator" : "offlinePingForDeveloper";
  await updateDoc(doc(db, "chats", chatId), { [key]: deleteField() });
}

/**
 * If the other party has not been “seen” on this chat recently, leave a ping they’ll see when they return.
 */
export async function maybeSetOfflinePingForPartner(chatId: string, senderUid: string): Promise<void> {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return;
  const room = snap.data() as ChatRoom;
  const isCreator = room.creatorUid === senderUid;
  const isDev     = room.developerUid === senderUid;
  if (!isCreator && !isDev) return;

  const otherLastKey = isCreator ? "developerLastSeenAt" : "creatorLastSeenAt";
  const pingKey      = isCreator ? "offlinePingForDeveloper" : "offlinePingForCreator";
  const otherName    = isCreator ? (room.developerName || "Developer") : (room.creatorName || "Project creator");
  const roleLabel    = isCreator ? "client" : "developer";

  const otherMs = firestoreTimestampMs((room as unknown as Record<string, unknown>)[otherLastKey]);
  const now     = Date.now();
  if (otherMs !== null && now - otherMs < OFFLINE_PING_AFTER_MS) return;

  const text = `Your ${roleLabel} (${otherName}) is trying to reach you in chat — open BuildCraft when you can.`;
  await updateDoc(doc(db, "chats", chatId), { [pingKey]: text });
}

function firestoreErrorCode(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) {
    return String((e as { code: string }).code);
  }
  return "";
}

/**
 * Creates the chat room if missing. Used from the browser (signed-in) and from /api/hire-respond (no auth).
 * When the room already exists, unauthenticated reads are denied by rules — treat permission-denied as OK.
 */
export async function createOrGetChat(data: Omit<ChatRoom, "lastMessage" | "lastMessageAt" | "lastSenderUid" | "createdAt">): Promise<void> {
  const ref = doc(db, "chats", data.chatId);
  let needsCreate = false;
  try {
    const snap = await getDoc(ref);
    needsCreate = !snap.exists();
  } catch (e: unknown) {
    if (firestoreErrorCode(e) === "permission-denied") {
      return;
    }
    throw e;
  }
  if (!needsCreate) return;
  await setDoc(ref, {
    ...data,
    lastMessage:   "",
    lastMessageAt: serverTimestamp(),
    lastSenderUid: "",
    createdAt:     serverTimestamp(),
  });
}

export async function sendChatMessage(chatId: string, msg: { text: string; senderUid: string; senderName: string }): Promise<string> {
  const ref = await addDoc(collection(db, "chats", chatId, "messages"), {
    text:       msg.text,
    senderUid:  msg.senderUid,
    senderName: msg.senderName,
    sentAt:     serverTimestamp(),
    read:       false,
  });
  // update last message on the chat doc
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage:   msg.text.slice(0, 100),
    lastMessageAt: serverTimestamp(),
    lastSenderUid: msg.senderUid,
  });
  return ref.id;
}

export function subscribeToChatMessages(
  chatId: string,
  cb: (msgs: ChatMessage[]) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("sentAt", "asc"),
    limit(200),
  );
  return onSnapshot(
    q,
    snap => {
      const msgs = snap.docs.map(d => normalizeChatMessage(d.id, d.data() as Record<string, unknown>));
      cb(msgs);
    },
    err => {
      console.error("[chat] subscribe messages:", err);
      onError?.(err.message || "Could not load messages");
      cb([]);
    },
  );
}

export async function markMessagesRead(chatId: string, readerUid: string): Promise<void> {
  // Mark messages from other party as read (best-effort)
  const q    = query(collection(db, "chats", chatId, "messages"), orderBy("sentAt", "desc"), limit(20));
  const snap = await import("firebase/firestore").then(m => m.getDocs(q));
  const batch = snap.docs.filter(d => d.data().senderUid !== readerUid && !d.data().read);
  await Promise.all(batch.map(d => updateDoc(d.ref, { read: true })));
}

export async function getChatRoom(chatId: string): Promise<ChatRoom | null> {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return null;
  return snap.data() as ChatRoom;
}

/** Real-time chat room metadata (creator/dev UIDs and names for message labels). */
export function subscribeToChatRoom(
  chatId: string,
  cb: (room: ChatRoom | null) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const ref = doc(db, "chats", chatId);
  return onSnapshot(
    ref,
    snap => {
      cb(snap.exists() ? (snap.data() as ChatRoom) : null);
    },
    err => {
      console.error("[chat] subscribe room:", err);
      onError?.(err.message || "Could not load chat room");
      cb(null);
    },
  );
}
