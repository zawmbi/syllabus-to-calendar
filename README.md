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

## Build for App Store

The project now includes [eas.json](/Users/linda/Coding/syllabus-to-calendar/eas.json) and production app identifiers in [app.json](/Users/linda/Coding/syllabus-to-calendar/app.json).

Before your first App Store build:

1. Replace the placeholder EAS project id in [app.json](/Users/linda/Coding/syllabus-to-calendar/app.json).
2. Add real app icons at:
   - `/Users/linda/Coding/syllabus-to-calendar/assets/icon.png`
   - `/Users/linda/Coding/syllabus-to-calendar/assets/adaptive-icon.png`
   - `/Users/linda/Coding/syllabus-to-calendar/assets/favicon.png`
3. If you want a different App Store identity, change:
   - iOS bundle id: `com.lindadev.syllabustocalendar`
   - Android package: `com.lindadev.syllabustocalendar`

Then run:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

For a development client build for native testing:

```bash
eas build --platform ios --profile development
```

## Simulator testing

If the iOS simulator makes file import awkward, use the built-in `Use sample syllabus` button in the app.

You can also test imports by:

- dragging a PDF or image from your Mac onto the iOS Simulator window
- opening the Files app inside the simulator and browsing local mirrored files
- using `Choose photo` after dragging an image into the simulator Photos app

## Environment

Copy `.env.example` to `.env` and add your backend endpoints when you are ready to leave demo mode.

- `EXPO_PUBLIC_PARSE_API_BASE_URL`
- `EXPO_PUBLIC_GOOGLE_EXPORT_URL`
- `EXPO_PUBLIC_NOTION_EXPORT_URL`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`

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

## Backend

A real backend scaffold is included in [server/package.json](/Users/linda/Coding/syllabus-to-calendar/server/package.json).

Run it with:

```bash
cd server
npm install
npm run dev
```

Then point the Expo app at it in `.env`:

```bash
EXPO_PUBLIC_PARSE_API_BASE_URL=http://YOUR_COMPUTER_IP:8787
EXPO_PUBLIC_GOOGLE_EXPORT_URL=http://YOUR_COMPUTER_IP:8787/exports/google
EXPO_PUBLIC_NOTION_EXPORT_URL=http://YOUR_COMPUTER_IP:8787/exports/notion
```

## OAuth setup

Google Calendar:

- create a Google Cloud project
- enable the Google Calendar API
- create OAuth credentials for a web application
- add `http://localhost:8787/oauth/google/callback` as an authorized redirect URI for local testing
- put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` into `server/.env`

Notion:

- create a public integration in Notion
- set the redirect URI to `http://localhost:8787/oauth/notion/callback`
- put `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, and `NOTION_DATABASE_ID` into `server/.env`

How the app flow works now:

- the app creates a per-device session id
- `Connect Google` and `Connect Notion` open the backend OAuth start routes
- the backend stores tokens in memory for that session
- `Refresh status` pulls the current connection state back into the app

Important limitation right now:

- tokens are stored in memory only, so restarting the backend clears connections
- for production you would move session and token storage into a database
- Notion still needs a target database id configured on the server

## In-app purchase setup

The app now uses RevenueCat for the one-time `$5 forever` unlock.

To finish setup:

1. Create a non-consumable / one-time purchase product in App Store Connect and Google Play Console.
2. Create or import the same product in RevenueCat.
3. Attach that product to an entitlement such as `pro`.
4. Add the product to your default offering, ideally as a lifetime package.
5. Put the public RevenueCat SDK keys into the Expo app `.env`.
6. Build a development build with Expo Dev Client to test real purchases.

For early testing, RevenueCat also supports Test Store products so you can test without finishing the full store setup first.

The app purchase logic lives in [src/services/purchases.ts](/Users/linda/Coding/syllabus-to-calendar/src/services/purchases.ts).
