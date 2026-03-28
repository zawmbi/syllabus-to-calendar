type SessionRecord = {
  google?: {
    refreshToken?: string;
    accessToken?: string;
  };
  notion?: {
    accessToken?: string;
    workspaceName?: string;
  };
};

const sessions = new Map<string, SessionRecord>();
const pendingStates = new Map<
  string,
  { sessionId: string; provider: "google" | "notion" }
>();

export function getSession(sessionId: string) {
  return sessions.get(sessionId) || {};
}

export function updateGoogleSession(
  sessionId: string,
  payload: SessionRecord["google"],
) {
  const current = getSession(sessionId);
  sessions.set(sessionId, {
    ...current,
    google: {
      ...current.google,
      ...payload,
    },
  });
}

export function updateNotionSession(
  sessionId: string,
  payload: SessionRecord["notion"],
) {
  const current = getSession(sessionId);
  sessions.set(sessionId, {
    ...current,
    notion: {
      ...current.notion,
      ...payload,
    },
  });
}

export function setPendingState(
  state: string,
  payload: { sessionId: string; provider: "google" | "notion" },
) {
  pendingStates.set(state, payload);
}

export function consumePendingState(state: string) {
  const value = pendingStates.get(state);
  pendingStates.delete(state);
  return value;
}
