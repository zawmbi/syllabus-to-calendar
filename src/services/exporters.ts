import * as Calendar from "expo-calendar";
import { Linking, Platform } from "react-native";

import { appConfig } from "../config";
import type { ParsedItem } from "../types";

function buildDateWindow(rawDate: string) {
  const start = new Date(`${rawDate}T09:00:00`);
  const end = new Date(`${rawDate}T10:00:00`);
  return { start, end };
}

function formatGoogleDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function firstGoogleEventUrl(item: ParsedItem) {
  const { start, end } = buildDateWindow(item.date);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details: item.notes || item.type,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
      timeZone: "America/Chicago",
    });
  }
}

export async function beginGoogleExport(items: ParsedItem[], sessionId: string) {
  if (appConfig.googleExportUrl) {
    const response = await fetch(appConfig.googleExportUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items, sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Google export failed: ${response.status}`);
    }

    return;
  }

  await Linking.openURL(firstGoogleEventUrl(items[0]));
}

export async function beginNotionExport(items: ParsedItem[], sessionId: string) {
  if (!appConfig.notionExportUrl) {
    throw new Error("Notion export endpoint is not configured");
  }

  const response = await fetch(appConfig.notionExportUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items, sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Notion export failed: ${response.status}`);
  }
}
