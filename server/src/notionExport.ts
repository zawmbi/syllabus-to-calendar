import { Client } from "@notionhq/client";

import { config } from "./config.js";
import type { ParsedItem } from "./types.js";

export async function exportItemsToNotion(
  items: ParsedItem[],
  accessToken: string,
) {
  if (!accessToken || !config.notionDatabaseId) {
    throw new Error(
      "Notion credentials are missing for this user or database configuration.",
    );
  }

  const notion = new Client({ auth: accessToken });

  for (const item of items) {
    await notion.pages.create({
      parent: {
        database_id: config.notionDatabaseId,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: item.title,
              },
            },
          ],
        },
        Date: {
          date: {
            start: item.date,
          },
        },
        Type: {
          select: {
            name: item.type,
          },
        },
      },
      children: item.notes
        ? [
            {
              object: "block",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: item.notes,
                    },
                  },
                ],
              },
            },
          ]
        : undefined,
    });
  }
}
