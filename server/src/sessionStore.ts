import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "./config.js";

type SessionRecord = {
  tokenHash: string;
  createdAt: number;
  google?: {
    refreshToken?: string;
    accessToken?: string;
  };
  notion?: {
    accessToken?: string;
    workspaceName?: string;
    databaseId?: string;
    databaseTitle?: string;
  };
};

const sessions = new Map<string, SessionRecord>();
const pendingStates = new Map<
  string,
  { sessionId: string; provider: "google" | "notion"; issuedAt: number }
>();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const STATE_TTL_MS = 1000 * 60 * 10;

function storeFilePath() {
  return path.resolve(config.sessionStorePath);
}

function ensureStoreDir() {
  const dir = path.dirname(storeFilePath());
  fs.mkdirSync(dir, { recursive: true });
}

let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function scheduleFlush() {
  dirty = true;
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) {
      return;
    }
    dirty = false;
    try {
      ensureStoreDir();
      const payload = JSON.stringify(Array.from(sessions.entries()));
      fs.writeFileSync(storeFilePath(), payload, { mode: 0o600 });
    } catch (error) {
      console.error("Failed to persist session store:", error);
    }
  }, 250);
}

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(storeFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Array<[string, SessionRecord]>;
    const now = Date.now();
    for (const [id, record] of parsed) {
      if (now - record.createdAt < SESSION_TTL_MS) {
        sessions.set(id, record);
      }
    }
  } catch {
    // No persisted state yet — fine on first start.
  }
}

loadFromDisk();

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSession() {
  const sessionId = `s_${crypto.randomBytes(16).toString("hex")}`;
  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(sessionId, {
    tokenHash: hashToken(token),
    createdAt: Date.now(),
  });
  scheduleFlush();

  return { sessionId, token };
}

export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function authenticate(sessionId: string, token: string) {
  if (!sessionId || !token) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    scheduleFlush();
    return null;
  }

  const provided = hashToken(token);
  const expected = session.tokenHash;

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return null;
  }

  return session;
}

export function updateGoogleSession(
  sessionId: string,
  payload: NonNullable<SessionRecord["google"]>,
) {
  const current = sessions.get(sessionId);
  if (!current) {
    return;
  }

  sessions.set(sessionId, {
    ...current,
    google: {
      ...current.google,
      ...payload,
    },
  });
  scheduleFlush();
}

export function updateNotionSession(
  sessionId: string,
  payload: NonNullable<SessionRecord["notion"]>,
) {
  const current = sessions.get(sessionId);
  if (!current) {
    return;
  }

  sessions.set(sessionId, {
    ...current,
    notion: {
      ...current.notion,
      ...payload,
    },
  });
  scheduleFlush();
}

export function setPendingState(
  state: string,
  payload: { sessionId: string; provider: "google" | "notion" },
) {
  pendingStates.set(state, { ...payload, issuedAt: Date.now() });
}

export function consumePendingState(state: string) {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);

  if (!entry) {
    return undefined;
  }

  if (Date.now() - entry.issuedAt > STATE_TTL_MS) {
    return undefined;
  }

  return { sessionId: entry.sessionId, provider: entry.provider };
}
