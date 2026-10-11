import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createBedrockClient } from "./lib/bedrock.mjs";
import {
  buildMuseumPrompt,
  UserInputError,
  validateRequest,
} from "./lib/futures.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
await loadLocalEnvironment(join(root, ".env.local"));

const publicDir = join(root, "public");
const port = Number(process.env.PORT) || 3000;
const bedrock = createBedrockClient();
const activeRequests = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);

  if (request.method === "GET" && request.url === "/api/health") {
    return sendJson(response, 200, {
      status: "awake",
      configured: Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK),
      model: "GPT-6 Astra",
    });
  }

  if (request.method === "POST" && request.url === "/api/foresee") {
    const requestId = request.headers["x-museum-request-id"];
    const controller = new AbortController();

    if (typeof requestId === "string") {
      activeRequests.get(requestId)?.abort();
      activeRequests.set(requestId, controller);
    }

    request.on("aborted", () => controller.abort());

    try {
      const body = await readJsonBody(request);
      const input = validateRequest(body);
      const result = await bedrock.createExhibit(buildMuseumPrompt(input), {
        signal: controller.signal,
      });

      return sendJson(response, 200, {
        ...result,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error.name === "AbortError") return;
      const status = error.statusCode || 500;
      const message =
        status >= 500 && !error.message
          ? "The museum encountered an unknown disturbance."
          : error.message;
      return sendJson(response, status, { error: message });
    } finally {
      if (typeof requestId === "string") activeRequests.delete(requestId);
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  return serveStatic(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FORK/6 is open at http://localhost:${port}`);
  if (!process.env.AWS_BEARER_TOKEN_BEDROCK) {
    console.log("Add AWS_BEARER_TOKEN_BEDROCK to .env.local to open live futures.");
  }
});

async function serveStatic(request, response) {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    return sendJson(response, 403, { error: "Forbidden." });
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendJson(response, 404, { error: "Exhibit not found." });
    }
    return sendJson(response, 500, { error: "Could not open the exhibit." });
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw new UserInputError("That idea is too large for the exhibit intake.");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserInputError("The exhibit intake received invalid JSON.");
  }
}

function sendJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'",
  );
}

async function loadLocalEnvironment(path) {
  try {
    const source = await readFile(path, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
