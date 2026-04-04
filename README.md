# syllabus-to-calendar

A simple Expo mobile app for iOS and Android that turns a PDF, JPEG, HEIC, or photo-scanned syllabus into a cleaner semester plan.

## Accounts to create

To get the full app working and deployed, sign up for:

1. OpenAI API
   Needed for PDF and image syllabus parsing.
2. Expo account
   Needed for EAS Build and EAS Submit.
3. Apple Developer Program
   Needed for iOS builds, TestFlight, and App Store release.
4. App Store Connect
   Needed for TestFlight and App Store listing management.
5. RevenueCat
   Needed for the monthly subscription.
6. Google Cloud
   Needed for Google Calendar OAuth and Calendar API access.
7. Notion integrations dashboard
   Needed for Notion OAuth and database exports.
8. Backend hosting provider
   Needed to run the parsing and OAuth server in production.
9. Google Play Console
   Needed only if you also want Android release.

## What each one is for

- OpenAI parses PDF syllabi and images into structured dates.
- Expo builds the native app binaries and submits them to stores.
- Apple Developer and App Store Connect handle iOS distribution.
- RevenueCat manages the `$3.99/month` subscription entitlement.
- Google Cloud handles Google Calendar sign-in and API access.
- Notion handles user sign-in and lets a user share a database with the app.
- A backend host runs the API in `server/`.

## Notion linked database flow

The app now supports a user-pasted Notion database link:

1. User connects Notion.
2. User pastes a database link in the Notion export area.
3. The backend extracts the database ID and verifies access.
4. The database is saved for that user session.
5. Exports go into that linked database.
