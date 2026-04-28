describe("appConfig helpers", () => {
  const originalEnv = process.env;

  function loadConfigModule() {
    let configModule: typeof import("./config");

    jest.isolateModules(() => {
      configModule = require("./config") as typeof import("./config");
    });

    return configModule!;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_PARSE_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_GOOGLE_EXPORT_URL;
    delete process.env.EXPO_PUBLIC_NOTION_EXPORT_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns falsey helpers when integration env vars are missing", () => {
    const config = loadConfigModule();

    expect(config.appConfig.parseApiBaseUrl).toBe("");
    expect(config.hasLiveParsing()).toBe(false);
    expect(config.hasGoogleExport()).toBe(false);
    expect(config.hasNotionExport()).toBe(false);
    expect(config.integrationBaseUrl()).toBe("");
  });

  it("trims integration env vars before exposing them", () => {
    process.env.EXPO_PUBLIC_PARSE_API_BASE_URL = " https://parse.example.com ";
    process.env.EXPO_PUBLIC_GOOGLE_EXPORT_URL = " https://google.example.com ";
    process.env.EXPO_PUBLIC_NOTION_EXPORT_URL = " https://notion.example.com ";

    const config = loadConfigModule();

    expect(config.appConfig.parseApiBaseUrl).toBe("https://parse.example.com");
    expect(config.appConfig.googleExportUrl).toBe("https://google.example.com");
    expect(config.appConfig.notionExportUrl).toBe("https://notion.example.com");
    expect(config.hasLiveParsing()).toBe(true);
    expect(config.hasGoogleExport()).toBe(true);
    expect(config.hasNotionExport()).toBe(true);
    expect(config.integrationBaseUrl()).toBe("https://parse.example.com");
  });
});
