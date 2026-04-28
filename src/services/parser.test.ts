import type { ImportedFile, ParsedItem } from "../types";

jest.mock("expo-file-system", () => ({
  __esModule: true,
  EncodingType: { Base64: "base64" },
  readAsStringAsync: jest.fn(),
}));

function getReadAsStringAsyncMock() {
  return jest.requireMock("expo-file-system").readAsStringAsync as jest.Mock;
}

const baseFile: ImportedFile = {
  name: "econ-syllabus.pdf",
  typeLabel: "PDF",
  source: "document",
  uri: "file:///tmp/econ-syllabus.pdf",
  mimeType: "application/pdf",
};

describe("parseSyllabus", () => {
  const originalEnv = process.env;

  function loadParserModule() {
    let parserModule: typeof import("./parser");

    jest.isolateModules(() => {
      parserModule = require("./parser") as typeof import("./parser");
    });

    return parserModule!;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_PARSE_API_BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses demo parsing for demo files", async () => {
    const { parseSyllabus } = loadParserModule();

    const result = await parseSyllabus({
      ...baseFile,
      uri: "demo://econ-syllabus.pdf",
    });

    expect(result.mode).toBe("demo");
    expect(result.items[0]?.title).toBe("econ-syllabus kickoff response");
    expect(getReadAsStringAsyncMock()).not.toHaveBeenCalled();
  });

  it("falls back to demo parsing when no live parser url is configured", async () => {
    const { parseSyllabus } = loadParserModule();

    const result = await parseSyllabus(baseFile);

    expect(result.mode).toBe("demo");
    expect(result.items).toHaveLength(10);
    expect(getReadAsStringAsyncMock()).not.toHaveBeenCalled();
  });

  it("returns live results when the parser api succeeds", async () => {
    process.env.EXPO_PUBLIC_PARSE_API_BASE_URL = "https://parse.example.com";
    getReadAsStringAsyncMock().mockResolvedValue("base64-payload");

    const liveItems: ParsedItem[] = [
      {
        title: "Midterm",
        date: "2026-10-12",
        type: "Exam",
        notes: "Bring a calculator.",
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: liveItems }),
    }) as jest.Mock;

    const { parseSyllabus } = loadParserModule();
    const result = await parseSyllabus(baseFile);

    expect(getReadAsStringAsyncMock()).toHaveBeenCalledWith(baseFile.uri, {
      encoding: "base64",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://parse.example.com/parse-syllabus",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result).toEqual({
      items: liveItems,
      mode: "live",
    });
  });

  it("falls back to demo parsing when the parser api fails", async () => {
    process.env.EXPO_PUBLIC_PARSE_API_BASE_URL = "https://parse.example.com";
    getReadAsStringAsyncMock().mockResolvedValue("base64-payload");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Parse request failed: 500" }),
    }) as jest.Mock;

    const { parseSyllabus } = loadParserModule();
    await expect(parseSyllabus(baseFile)).rejects.toThrow(
      "Parse request failed: 500",
    );
  });
});
