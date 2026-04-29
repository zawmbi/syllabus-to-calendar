import { integrationBaseUrl } from "../config";
import type { SessionCredentials } from "../types";

export async function createServerSession(): Promise<SessionCredentials | null> {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Partial<SessionCredentials>;

  if (!data.sessionId || !data.token) {
    return null;
  }

  return { sessionId: data.sessionId, token: data.token };
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  } as const;
}
