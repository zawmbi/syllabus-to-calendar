export type ImportKind = "document" | "photo";
export type ExportTarget = "Google Calendar" | "Apple Calendar" | "Notion";
export type ParsedItemType = "Homework" | "Exam" | "Lab / Discussion" | "Break";

export type ParsedItem = {
  title: string;
  date: string;
  type: ParsedItemType;
  notes?: string;
};

export type ImportedFile = {
  name: string;
  typeLabel: string;
  source: ImportKind;
  uri: string;
  mimeType?: string | null;
};

export type ParseResult = {
  items: ParsedItem[];
  mode: "demo" | "live";
};
