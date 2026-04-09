import type { ImportedFile, ParsedItem } from "./types";

const demoItems: ParsedItem[] = [
  {
    title: "Reading response 01",
    date: "2026-09-03",
    type: "Homework",
    notes: "250-word response on the course introduction.",
  },
  {
    title: "Problem set 01",
    date: "2026-09-10",
    type: "Homework",
    notes: "Submit as PDF before class.",
  },
  {
    title: "Essay draft",
    date: "2026-09-23",
    type: "Homework",
    notes: "Bring one printed copy for peer review.",
  },
  {
    title: "Annotated bibliography",
    date: "2026-10-08",
    type: "Homework",
    notes: "At least six sources in MLA format.",
  },
  {
    title: "Midterm exam",
    date: "2026-09-18",
    type: "Exam",
    notes: "Covers weeks 1 through 4.",
  },
  {
    title: "Quiz 02",
    date: "2026-10-01",
    type: "Exam",
    notes: "Short in-class quiz on lecture notes.",
  },
  {
    title: "Final presentation",
    date: "2026-11-19",
    type: "Exam",
    notes: "10-minute presentation with slides.",
  },
  {
    title: "Lab check-in A",
    date: "2026-09-07",
    type: "Lab / Discussion",
    notes: "Bring your draft workflow to section.",
  },
  {
    title: "Discussion lead",
    date: "2026-09-28",
    type: "Lab / Discussion",
    notes: "Lead the first 15 minutes of class discussion.",
  },
  {
    title: "Methods lab",
    date: "2026-10-15",
    type: "Lab / Discussion",
    notes: "Laptop required.",
  },
];

export function buildDemoParseResults(file: ImportedFile): ParsedItem[] {
  const baseName = file.name.replace(/\.[^.]+$/, "");

  return demoItems.map((item, index) => {
    if (index === 0) {
      return {
        ...item,
        title: `${baseName} kickoff response`,
      };
    }

    return item;
  });
}
