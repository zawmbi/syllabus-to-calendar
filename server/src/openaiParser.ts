import OpenAI from "openai";
import mammoth from "mammoth";

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
      "type": "Homework" | "Exam" | "Lab / Discussion" | "Break",
      "notes": "string optional"
    }
  ]
}

Only include events with clear dates.
Normalize dates to YYYY-MM-DD.
Prefer actual due dates, exams, labs, quizzes, discussions, and required course milestones.
Ignore general course policies, weekly reading topics without due dates, and placeholder examples.
`;

type OpenAiParseResponse = {
  items?: ParsedItem[];
};

function isPdfFile(input: { fileName: string; mimeType: string }) {
  return (
    input.mimeType.includes("pdf") || input.fileName.toLowerCase().endsWith(".pdf")
  );
}

function isWordFile(input: { fileName: string; mimeType: string }) {
  const lowerName = input.fileName.toLowerCase();

  return (
    input.mimeType.includes("wordprocessingml.document") ||
    input.mimeType.includes("msword") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc")
  );
}

function isImageFile(input: { fileName: string; mimeType: string }) {
  return input.mimeType.startsWith("image/");
}

function parseJsonPayload(rawText: string) {
  const trimmed = rawText.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(withoutCodeFence) as OpenAiParseResponse;
}

async function extractWordText(fileBase64: string) {
  const buffer = Buffer.from(fileBase64, "base64");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\s+\n/g, "\n").trim();
}

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
  let content:
    | Array<
        | { type: "input_text"; text: string }
        | { type: "input_file"; filename: string; file_data: string }
        | { type: "input_image"; image_url: string; detail: "auto" }
      >;

  if (isPdfFile(input)) {
    content = [
      {
        type: "input_text",
        text: extractionPrompt,
      },
      {
        type: "input_file",
        filename: input.fileName,
        file_data: dataUrl,
      },
    ];
  } else if (isWordFile(input)) {
    const extractedText = await extractWordText(input.fileBase64);

    if (!extractedText) {
      throw new Error("Could not extract text from the Word document");
    }

    content = [
      {
        type: "input_text",
        text: `${extractionPrompt}

File name: ${input.fileName}
File type: Word document

Syllabus text:
${extractedText}`,
      },
    ];
  } else if (isImageFile(input)) {
    content = [
      {
        type: "input_text",
        text: extractionPrompt,
      },
      {
        type: "input_image",
        image_url: dataUrl,
        detail: "auto",
      },
    ];
  } else {
    throw new Error(
      `Unsupported syllabus format: ${input.fileName}. Please upload a PDF, DOCX, or image.`,
    );
  }

  const response = await client.responses.create({
    model: config.openAiModel,
    input: [
      {
        role: "user",
        content,
      },
    ],
  });

  const rawText = response.output_text;
  const parsed = parseJsonPayload(rawText);

  if (!Array.isArray(parsed.items)) {
    throw new Error("OpenAI did not return syllabus items");
  }

  return parsed.items;
}
