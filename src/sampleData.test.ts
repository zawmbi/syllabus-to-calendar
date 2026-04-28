import { buildDemoParseResults } from "./sampleData";
import type { ImportedFile } from "./types";

describe("buildDemoParseResults", () => {
  it("uses the uploaded file name to personalize the first item", () => {
    const file: ImportedFile = {
      name: "history-101.pdf",
      typeLabel: "PDF",
      source: "document",
      uri: "demo://history-101.pdf",
      mimeType: "application/pdf",
    };

    const items = buildDemoParseResults(file);

    expect(items[0]?.title).toBe("history-101 kickoff response");
    expect(items).toHaveLength(10);
  });

  it("keeps the rest of the seeded syllabus data stable", () => {
    const file: ImportedFile = {
      name: "biology-syllabus.png",
      typeLabel: "Photo",
      source: "photo",
      uri: "demo://biology-syllabus.png",
      mimeType: "image/png",
    };

    const items = buildDemoParseResults(file);

    expect(items[1]?.title).toBe("Problem set 01");
    expect(items.some((item) => item.type === "Exam")).toBe(true);
    expect(items.some((item) => item.type === "Lab / Discussion")).toBe(true);
  });
});
