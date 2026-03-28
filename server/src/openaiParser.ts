import OpenAI from "openai";

import { config } from "./config.js";
import type { ParsedItem } from "./types.js";

const extractionPrompt = `
You extract structured syllabus events.
Return strict JSON with this shape:
{
  "items": [
    {
      "title": "string",
      "date": "YYYY-MM-DD",
      "type": "Important date" | "Homework" | "Exam",
      "notes": "string optional"
    }
  ]
}

Only include events with clear dates.
Normalize dates to YYYY-MM-DD.
`;

type OpenAiParseResponse = {
  items?: ParsedItem[];
};

export async function parseWithOpenAI(input: {
  fileName: string;
  mimeType: string;
  fileBase64: string;
}) {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const dataUrl = `data:${input.mimeType};base64,${input.fileBase64}`;

  const response = await client.responses.create({
    model: config.openAiModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: extractionPrompt,
          },
          input.mimeType.includes("pdf")
            ? {
                type: "input_file",
                filename: input.fileName,
                file_data: dataUrl,
              }
            : {
                type: "input_image",
                image_url: dataUrl,
                detail: "auto",
              },
        ],
      },
    ],
  });

  const rawText = response.output_text;
  const parsed = JSON.parse(rawText) as OpenAiParseResponse;

  if (!Array.isArray(parsed.items)) {
    throw new Error("OpenAI did not return syllabus items");
  }

  return parsed.items;
}
