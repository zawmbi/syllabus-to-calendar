import "dotenv/config";

function required(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openAiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    "http://localhost:8787/oauth/google/callback",
  appBaseUrl:
    process.env.APP_BASE_URL?.trim() || "http://localhost:8787",
  notionClientId: process.env.NOTION_CLIENT_ID?.trim() || "",
  notionClientSecret: process.env.NOTION_CLIENT_SECRET?.trim() || "",
  notionRedirectUri:
    process.env.NOTION_REDIRECT_URI?.trim() ||
    "http://localhost:8787/oauth/notion/callback",
  notionToken: process.env.NOTION_TOKEN?.trim() || "",
  notionDatabaseId: process.env.NOTION_DATABASE_ID?.trim() || "",
  require,
};
