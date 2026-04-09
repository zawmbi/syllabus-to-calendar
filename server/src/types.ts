export type ParsedItemType = "Homework" | "Exam" | "Lab / Discussion" | "Break";

export type ParsedItem = {
  title: string;
  date: string;
  type: ParsedItemType;
  notes?: string;
};

export type ParseRequestBody = {
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
};
