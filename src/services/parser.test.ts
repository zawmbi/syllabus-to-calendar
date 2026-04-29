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

  const testCredentials = {
    sessionId: "s_test",
    token: "token_test",
  };

  it("uses demo parsing for demo files", async () => {
    const { parseSyllabus } = loadParserModule();

    const result = await parseSyllabus(
      {
        ...baseFile,
        uri: "demo://econ-syllabus.pdf",
      },
      testCredentials,
    );

    expect(result.mode).toBe("demo");
    expect(result.items[0]?.title).toBe("econ-syllabus kickoff response");
    expect(getReadAsStringAsyncMock()).not.toHaveBeenCalled();
  });

  it("falls back to demo parsing when no live parser url is configured", async () => {
    const { parseSyllabus } = loadParserModule();

    const result = await parseSyllabus(baseFile, testCredentials);

    expect(result.mode).toBe("demo");
    expect(result.items).toHaveLength(10);
    expect(getReadAsStringAsyncMock()).not.toHaveBeenCalled();
  });

  it("falls back to demo parsing when no credentials are available", async () => {
    process.env.EXPO_PUBLIC_PARSE_API_BASE_URL = "https://parse.example.com";

    const { parseSyllabus } = loadParserModule();

    const result = await parseSyllabus(baseFile, null);

    expect(result.mode).toBe("demo");
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
    const result = await parseSyllabus(baseFile, testCredentials);

    expect(getReadAsStringAsyncMock()).toHaveBeenCalledWith(baseFile.uri, {
      encoding: "base64",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://parse.example.com/parse-syllabus",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${testCredentials.token}`,
        }),
      }),
    );
    expect(result).toEqual({
      items: liveItems,
      mode: "live",
    });
  });

  it("propagates the api error when the parser api fails", async () => {
    process.env.EXPO_PUBLIC_PARSE_API_BASE_URL = "https://parse.example.com";
    getReadAsStringAsyncMock().mockResolvedValue("base64-payload");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Parse request failed: 500" }),
    }) as jest.Mock;

    const { parseSyllabus } = loadParserModule();
    await expect(parseSyllabus(baseFile, testCredentials)).rejects.toThrow(
      "Parse request failed: 500",
    );
  });
});
