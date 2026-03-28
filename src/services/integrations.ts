import { Linking } from "react-native";

import { integrationBaseUrl } from "../config";

export type IntegrationStatus = {
  googleConnected: boolean;
  notionConnected: boolean;
  notionWorkspaceName: string | null;
};

export async function fetchIntegrationStatus(sessionId: string) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    return {
      googleConnected: false,
      notionConnected: false,
      notionWorkspaceName: null,
    } satisfies IntegrationStatus;
  }

  const response = await fetch(
    `${baseUrl}/integrations/status?sessionId=${encodeURIComponent(sessionId)}`,
  );

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return (await response.json()) as IntegrationStatus;
}

export async function beginGoogleOAuth(sessionId: string) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    throw new Error("Set EXPO_PUBLIC_PARSE_API_BASE_URL before connecting Google.");
  }

  await Linking.openURL(
    `${baseUrl}/oauth/google/start?sessionId=${encodeURIComponent(sessionId)}`,
  );
}

export async function beginNotionOAuth(sessionId: string) {
  const baseUrl = integrationBaseUrl();

  if (!baseUrl) {
    throw new Error("Set EXPO_PUBLIC_PARSE_API_BASE_URL before connecting Notion.");
  }

  await Linking.openURL(
    `${baseUrl}/oauth/notion/start?sessionId=${encodeURIComponent(sessionId)}`,
  );
}
