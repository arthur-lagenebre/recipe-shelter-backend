import http from "node:http";
import "dotenv/config";
import { dbHealth } from "./db/index.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health/live") {
    return sendJson(res, 200, {
      status: "ok",
      live: true,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && path === "/health/ready") {
    const dbUp = await dbHealth();
    return sendJson(res, dbUp ? 200 : 503, {
      status: dbUp ? "ok" : "error",
      ready: dbUp,
      database: dbUp ? "up" : "down",
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && path === "/health") {
    const dbUp = await dbHealth();
    return sendJson(res, dbUp ? 200 : 503, {
      status: dbUp ? "ok" : "error",
      live: true,
      ready: dbUp,
      database: dbUp ? "up" : "down",
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && path === "/") {
    return sendJson(res, 200, {
      message: "Recipe Shelter API",
      timestamp: new Date().toISOString(),
    });
  }

  // 404
  return sendJson(res, 404, { status: "error", message: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});