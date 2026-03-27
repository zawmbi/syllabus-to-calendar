export const appConfig = {
  parseApiBaseUrl: process.env.EXPO_PUBLIC_PARSE_API_BASE_URL?.trim() || "",
  googleExportUrl:
    process.env.EXPO_PUBLIC_GOOGLE_EXPORT_URL?.trim() || "",
  notionExportUrl:
    process.env.EXPO_PUBLIC_NOTION_EXPORT_URL?.trim() || "",
};

export function hasLiveParsing() {
  return Boolean(appConfig.parseApiBaseUrl);
}

export function hasGoogleExport() {
  return Boolean(appConfig.googleExportUrl);
}

export function hasNotionExport() {
  return Boolean(appConfig.notionExportUrl);
}
