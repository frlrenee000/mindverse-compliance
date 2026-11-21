import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { files } from "./build.mjs";

try { process.loadEnvFile(".env"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const port = Number(process.env.PORT ?? 3061);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const { stripTypeScriptTypes } = await import("node:module");
const assets = new Map(await Promise.all(Object.entries(files).map(async ([route, [source, type]]) => [
  route, { type, body: source.endsWith(".ts") ? stripTypeScriptTypes(await readFile(source, "utf8")) : await readFile(source) },
])));
createServer((request, response) => {
  if (request.headers.host !== `localhost:${port}` && request.headers.host !== `127.0.0.1:${port}`) {
    response.writeHead(403).end();
    return;
  }
  const route = request.url?.split("?")[0];
  const asset = assets.get(route === "/index.html" ? "/" : route);
  if ((request.method !== "GET" && request.method !== "HEAD") || !asset) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": asset.type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  }).end(request.method === "HEAD" ? undefined : asset.body);
}).listen(port, "127.0.0.1", () => console.log(`Mindverse is running at http://localhost:${port}`));
