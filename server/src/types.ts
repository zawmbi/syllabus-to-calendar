export type ParsedItemType = "Important date" | "Homework" | "Exam";

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
