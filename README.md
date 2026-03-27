# syllabus-to-calendar

A simple Expo mobile app for iOS and Android that turns a PDF, JPEG, HEIC, or photo-scanned syllabus into a cleaner semester plan.

The current starter screen is designed around:

- syllabus upload and scan flow
- distinguishing important dates, homework, and exams
- export targets for Google Calendar, Apple Calendar, and Notion
- future integration with an attendance tracker app
- live-ready parsing and export integration hooks

## Run locally

```bash
npm install
npm start
```

## Environment

Copy `.env.example` to `.env` and add your backend endpoints when you are ready to leave demo mode.

- `EXPO_PUBLIC_PARSE_API_BASE_URL`
- `EXPO_PUBLIC_GOOGLE_EXPORT_URL`
- `EXPO_PUBLIC_NOTION_EXPORT_URL`

## Backend contract

The app is wired to call these endpoints:

- `POST {EXPO_PUBLIC_PARSE_API_BASE_URL}/parse-syllabus`
- `POST {EXPO_PUBLIC_GOOGLE_EXPORT_URL}`
- `POST {EXPO_PUBLIC_NOTION_EXPORT_URL}`

Expected payloads:

- parse: `{ fileName, mimeType, fileBase64 }`
- google export: `{ items }`
- notion export: `{ items }`

Expected parse response:

```json
{
  "items": [
    {
      "title": "First midterm",
      "date": "2026-09-18",
      "type": "Exam",
      "notes": "Bring blue book"
    }
  ]
}
```
