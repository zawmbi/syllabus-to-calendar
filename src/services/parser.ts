import * as FileSystem from "expo-file-system";

import { appConfig } from "../config";
import { buildDemoParseResults } from "../sampleData";
import type { ImportedFile, ParseResult, ParsedItem } from "../types";

type ParseApiResponse = {
  items?: ParsedItem[];
};

export async function parseSyllabus(file: ImportedFile): Promise<ParseResult> {
  if (file.uri.startsWith("demo://")) {
    return {
      items: buildDemoParseResults(file),
      mode: "demo",
    };
  }

  if (!appConfig.parseApiBaseUrl) {
    return {
      items: buildDemoParseResults(file),
      mode: "demo",
    };
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const response = await fetch(
      `${appConfig.parseApiBaseUrl}/parse-syllabus`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.mimeType,
          fileBase64: base64,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Parse request failed: ${response.status}`);
    }

    const data = (await response.json()) as ParseApiResponse;
    const items = Array.isArray(data.items) ? data.items : [];

    if (!items.length) {
      throw new Error("No parsed items returned from API");
    }

    return {
      items,
      mode: "live",
    };
  } catch {
    return {
      items: buildDemoParseResults(file),
      mode: "demo",
    };
  }
}
