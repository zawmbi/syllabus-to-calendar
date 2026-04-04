import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import { Client } from "@notionhq/client";

import { config } from "./config.js";
import { exportItemsToGoogleCalendar } from "./googleExport.js";
import { exportItemsToNotion } from "./notionExport.js";
import { parseWithOpenAI } from "./openaiParser.js";
import {
  consumePendingState,
  getSession,
  setPendingState,
  updateGoogleSession,
  updateNotionSession,
} from "./sessionStore.js";
import type { ParseRequestBody, ParsedItem } from "./types.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/integrations/status", (req, res) => {
  const sessionId = String(req.query.sessionId || "");

  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  const session = getSession(sessionId);
  res.json({
    googleConnected: Boolean(session.google?.refreshToken),
    notionConnected: Boolean(session.notion?.accessToken),
    notionWorkspaceName: session.notion?.workspaceName || null,
    notionDatabaseId: session.notion?.databaseId || null,
    notionDatabaseTitle: session.notion?.databaseTitle || null,
  });
});

function extractNotionDatabaseId(input: string) {
  const normalized = input.trim();
  const match = normalized.match(
    /([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})/,
  );

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}-${match[5]}`.toLowerCase();
}

app.post("/integrations/notion/database", async (req, res) => {
  try {
    const sessionId = String(req.body.sessionId || "");
    const databaseLink = String(req.body.databaseLink || "");

    if (!sessionId || !databaseLink) {
      res.status(400).json({ error: "Missing sessionId or databaseLink" });
      return;
    }

    const session = getSession(sessionId);

    if (!session.notion?.accessToken) {
      res.status(401).json({ error: "Notion account is not connected for this session" });
      return;
    }

    const databaseId = extractNotionDatabaseId(databaseLink);

    if (!databaseId) {
      res.status(400).json({ error: "Could not find a Notion database ID in that link" });
      return;
    }

    const notion = new Client({ auth: session.notion.accessToken });
    const database = await notion.databases.retrieve({ database_id: databaseId });
    const title =
      "title" in database && Array.isArray(database.title) && database.title.length
        ? database.title.map((part) => ("plain_text" in part ? part.plain_text : "")).join("").trim()
        : "Linked database";

    updateNotionSession(sessionId, {
      databaseId,
      databaseTitle: title || "Linked database",
    });

    res.json({
      ok: true,
      databaseId,
      databaseTitle: title || "Linked database",
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not verify the Notion database link",
    });
  }
});

app.get("/oauth/google/start", (req, res) => {
  const sessionId = String(req.query.sessionId || "");

  if (!sessionId) {
    res.status(400).send("Missing sessionId");
    return;
  }

  if (!config.googleClientId || !config.googleClientSecret) {
    res.status(500).send("Google OAuth is not configured on the server.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  setPendingState(state, { sessionId, provider: "google" });

  const scopes = ["https://www.googleapis.com/auth/calendar.events"];
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/oauth/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const pending = consumePendingState(state);

    if (!code || !pending || pending.provider !== "google") {
      res.status(400).send("Invalid Google OAuth callback.");
      return;
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    updateGoogleSession(pending.sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    res.send(
      `<html><body style="font-family: Georgia, serif; padding: 32px; background: #F5F0E6; color: #315F57;"><h1>Google connected</h1><p>You can go back to the app now.</p></body></html>`,
    );
  } catch (error) {
    res.status(500).send(
      error instanceof Error ? error.message : "Google OAuth callback failed",
    );
  }
});

app.get("/oauth/notion/start", (req, res) => {
  const sessionId = String(req.query.sessionId || "");

  if (!sessionId) {
    res.status(400).send("Missing sessionId");
    return;
  }

  if (!config.notionClientId || !config.notionClientSecret) {
    res.status(500).send("Notion OAuth is not configured on the server.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  setPendingState(state, { sessionId, provider: "notion" });

  const params = new URLSearchParams({
    client_id: config.notionClientId,
    response_type: "code",
    owner: "user",
    redirect_uri: config.notionRedirectUri,
    state,
  });

  res.redirect(`https://api.notion.com/v1/oauth/authorize?${params.toString()}`);
});

app.get("/oauth/notion/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const pending = consumePendingState(state);

    if (!code || !pending || pending.provider !== "notion") {
      res.status(400).send("Invalid Notion OAuth callback.");
      return;
    }

    const basicAuth = Buffer.from(
      `${config.notionClientId}:${config.notionClientSecret}`,
    ).toString("base64");

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.notionRedirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Notion token exchange failed: ${tokenResponse.status}`);
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      workspace_name?: string;
    };

    updateNotionSession(pending.sessionId, {
      accessToken: tokens.access_token,
      workspaceName: tokens.workspace_name,
    });

    res.send(
      `<html><body style="font-family: Georgia, serif; padding: 32px; background: #F5F0E6; color: #315F57;"><h1>Notion connected</h1><p>You can go back to the app now.</p></body></html>`,
    );
  } catch (error) {
    res.status(500).send(
      error instanceof Error ? error.message : "Notion OAuth callback failed",
    );
  }
});

app.post("/parse-syllabus", async (req, res) => {
  try {
    const body = req.body as ParseRequestBody;

    if (!body.fileName || !body.mimeType || !body.fileBase64) {
      res.status(400).json({ error: "Missing fileName, mimeType, or fileBase64" });
      return;
    }

    const items = await parseWithOpenAI({
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileBase64: body.fileBase64,
    });

    res.json({ items });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown parse error",
    });
  }
});

app.post("/exports/google", async (req, res) => {
  try {
    const items = req.body.items as ParsedItem[];
    const sessionId = String(req.body.sessionId || "");

    if (!Array.isArray(items) || !items.length || !sessionId) {
      res.status(400).json({ error: "Missing export items or sessionId" });
      return;
    }

    const session = getSession(sessionId);

    if (!session.google?.refreshToken) {
      res.status(401).json({ error: "Google account is not connected for this session" });
      return;
    }

    await exportItemsToGoogleCalendar(items, session.google.refreshToken);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Google export failed",
    });
  }
});

app.post("/exports/notion", async (req, res) => {
  try {
    const items = req.body.items as ParsedItem[];
    const sessionId = String(req.body.sessionId || "");

    if (!Array.isArray(items) || !items.length || !sessionId) {
      res.status(400).json({ error: "Missing export items or sessionId" });
      return;
    }

    const session = getSession(sessionId);

    if (!session.notion?.accessToken) {
      res.status(401).json({ error: "Notion account is not connected for this session" });
      return;
    }

    const databaseId = session.notion.databaseId || config.notionDatabaseId;

    if (!databaseId) {
      res.status(400).json({ error: "No Notion database has been linked for this session" });
      return;
    }

    await exportItemsToNotion(items, session.notion.accessToken, databaseId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Notion export failed",
    });
  }
});

app.listen(config.port, () => {
  console.log(`Syllabus backend listening on http://localhost:${config.port}`);
});
