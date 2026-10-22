import http from "node:http";
import { createApplication } from "./app.js";
import { config } from "./config.js";

const app = createApplication();

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function matchOrderPath(pathname) {
  const match = pathname.match(/^\/orders\/([^/]+)$/);
  return match?.[1];
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok", deployment: "modular-monolith" });
    }

    if (request.method === "GET" && url.pathname === "/products") {
      return sendJson(response, 200, app.services.inventory.listProducts());
    }

    if (request.method === "POST" && url.pathname === "/checkout") {
      const result = await app.services.checkout.checkout(await readJson(request));
      return sendJson(response, 201, result);
    }

    if (request.method === "GET" && url.pathname === "/orders") {
      const orders = app.services.orders.list({ status: url.searchParams.get("status") });
      return sendJson(response, 200, orders);
    }

    const orderId = matchOrderPath(url.pathname);
    if (request.method === "GET" && orderId) {
      return sendJson(response, 200, app.services.orders.requireOrder(orderId));
    }

    if (request.method === "GET" && url.pathname === "/reports/sales") {
      const report = app.services.reporting.buildSalesSummary({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to")
      });
      return sendJson(response, 200, report);
    }

    if (request.method === "GET" && url.pathname === "/reports/operational-health") {
      return sendJson(response, 200, app.services.reporting.operationalHealth());
    }

    return sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    return sendJson(response, status, {
      error: error.code ?? "INTERNAL_ERROR",
      message: status === 500 ? "Unexpected server error" : error.message
    });
  }
});

server.listen(config.port, () => {
  console.log(`OrderFlow listening on http://localhost:${config.port}`);
});

const notificationDispatcher = setInterval(() => {
  app.services.notifications.dispatchPending().catch((error) => {
    console.error("Notification dispatch failed", error);
  });
}, config.notification.dispatchIntervalMs);

function shutdown() {
  clearInterval(notificationDispatcher);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
