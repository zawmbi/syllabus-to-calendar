import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

import { appConfig } from "../config";
import type { ParsedItem, SessionCredentials } from "../types";

function buildDateWindow(rawDate: string) {
  const start = new Date(`${rawDate}T09:00:00`);
  const end = new Date(`${rawDate}T10:00:00`);
  return { start, end };
}

function getDeviceTimeZone() {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || "UTC";
  } catch {
    return "UTC";
  }
}

async function getWritableCalendarId() {
  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar.id;
  }

  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const writableCalendar = calendars.find((calendar) => calendar.allowsModifications);

  if (writableCalendar) {
    return writableCalendar.id;
  }

  throw new Error("No writable calendar found on this device");
}

export async function exportToDeviceCalendar(items: ParsedItem[]) {
  const permission = await Calendar.requestCalendarPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Calendar permission was not granted");
  }

  const calendarId = await getWritableCalendarId();

  for (const item of items) {
    const { start, end } = buildDateWindow(item.date);
    await Calendar.createEventAsync(calendarId, {
      title: item.title,
      startDate: start,
      endDate: end,
      notes: item.notes || item.type,
      timeZone: getDeviceTimeZone(),
    });
  }
}

export async function beginGoogleExport(
  items: ParsedItem[],
  credentials: SessionCredentials,
) {
  if (!appConfig.googleExportUrl) {
    throw new Error("Google export needs the backend connection to be configured.");
  }

  const response = await fetch(appConfig.googleExportUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
    body: JSON.stringify({ items, sessionId: credentials.sessionId }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error || `Google export failed: ${response.status}`);
  }
}

export async function beginNotionExport(
  items: ParsedItem[],
  credentials: SessionCredentials,
) {
  if (!appConfig.notionExportUrl) {
    throw new Error("Notion export endpoint is not configured");
  }

  const response = await fetch(appConfig.notionExportUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
    body: JSON.stringify({ items, sessionId: credentials.sessionId }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error || `Notion export failed: ${response.status}`);
  }
}
