import { Linking } from "react-native";

import { integrationBaseUrl } from "../config";
import type { SessionCredentials } from "../types";

export type IntegrationStatus = {
  googleConnected: boolean;
  notionConnected: boolean;
  notionWorkspaceName: string | null;
  notionDatabaseId: string | null;
  notionDatabaseTitle: string | null;
};

export async function fetchIntegrationStatus(
  credentials: SessionCredentials,
): Promise<IntegrationStatus> {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    return {
      googleConnected: false,
      notionConnected: false,
      notionWorkspaceName: null,
      notionDatabaseId: null,
      notionDatabaseTitle: null,
    };
  }

  const response = await fetch(
    `${baseUrl}/integrations/status?sessionId=${encodeURIComponent(credentials.sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${credentials.token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return (await response.json()) as IntegrationStatus;
}

export async function beginGoogleOAuth(credentials: SessionCredentials) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    throw new Error("Set EXPO_PUBLIC_PARSE_API_BASE_URL before connecting Google.");
  }

  const params = new URLSearchParams({
    sessionId: credentials.sessionId,
    token: credentials.token,
  });

  await Linking.openURL(`${baseUrl}/oauth/google/start?${params.toString()}`);
}

export async function beginNotionOAuth(credentials: SessionCredentials) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    throw new Error("Set EXPO_PUBLIC_PARSE_API_BASE_URL before connecting Notion.");
  }

  const params = new URLSearchParams({
    sessionId: credentials.sessionId,
    token: credentials.token,
  });

  await Linking.openURL(`${baseUrl}/oauth/notion/start?${params.toString()}`);
}

export async function linkNotionDatabase(
  credentials: SessionCredentials,
  databaseLink: string,
) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    throw new Error("Set EXPO_PUBLIC_PARSE_API_BASE_URL before linking Notion.");
  }

  const response = await fetch(`${baseUrl}/integrations/notion/database`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
    body: JSON.stringify({
      sessionId: credentials.sessionId,
      databaseLink,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error || `Notion link failed: ${response.status}`);
  }

  return (await response.json()) as {
    ok: true;
    databaseId: string;
    databaseTitle: string;
  };
}
