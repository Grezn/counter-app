#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp/server.mjs"],
  cwd: PROJECT_ROOT,
  stderr: "pipe",
});

const client = new Client({
  name: "counter-app-smoke",
  version: "1.0.0",
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const resources = await client.listResources();
  const prompts = await client.listPrompts();
  const runbookSearch = await client.callTool({
    name: "search_runbooks",
    arguments: { q: "Akamai", limit: 2 },
  });
  const readme = await client.readResource({
    uri: "counter-app://docs/readme",
  });

  const firstSearchText = runbookSearch.content?.find((item) => item.type === "text")?.text || "{}";
  const parsedSearch = JSON.parse(firstSearchText);

  console.log(JSON.stringify({
    tools: tools.tools.map((tool) => tool.name),
    resources: resources.resources.map((resource) => resource.uri),
    prompts: prompts.prompts.map((prompt) => prompt.name),
    runbookMatches: parsedSearch.filtered,
    readmeBytes: readme.contents?.[0]?.text?.length || 0,
  }, null, 2));
} finally {
  await client.close();
}
