import { google } from "googleapis";

import { config } from "./config.js";
import type { ParsedItem } from "./types.js";

function buildEventWindow(rawDate: string) {
  const start = new Date(`${rawDate}T09:00:00`);
  const end = new Date(`${rawDate}T10:00:00`);
  return { start, end };
}

export async function exportItemsToGoogleCalendar(
  items: ParsedItem[],
  refreshToken: string,
) {
  if (
    !config.googleClientId ||
    !config.googleClientSecret ||
    !refreshToken
  ) {
    throw new Error(
      "Google credentials are missing for this user connection.",
    );
  }

  const auth = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth });

  for (const item of items) {
    const { start, end } = buildEventWindow(item.date);
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: item.title,
        description: item.notes || item.type,
        start: {
          dateTime: start.toISOString(),
        },
        end: {
          dateTime: end.toISOString(),
        },
      },
    });
  }
}
