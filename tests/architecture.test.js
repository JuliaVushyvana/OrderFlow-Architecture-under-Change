import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createApplication } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { ExternalDependencyError } from "../src/shared/errors.js";

const sourceRoot = new URL("../src/", import.meta.url);
const modules = ["checkout", "inventory", "notifications", "orders", "payments", "reporting"];

// Collections each module may touch through the shared database.
const ownedCollections = {
  checkout: [],
  inventory: ["products", "inventoryOperations"],
  notifications: ["notifications", "notificationOutbox"],
  orders: ["orders", "nextId"],
  payments: ["payments", "nextId"],
  // Known debt: Reporting reads operational data until a read model exists.
  reporting: ["orders", "payments", "notifications", "products"]
};

function moduleSources(moduleName) {
  const directory = new URL(`${moduleName}/`, sourceRoot);
  return readdirSync(directory)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file: `${moduleName}/${file}`, source: readFileSync(new URL(file, directory), "utf8") }));
}

const successfulPaymentProvider = {
  async charge(input) {
    return { ...input, provider: "TestPay", providerPaymentId: "provider_1", latencyMs: 1 };
  }
};

const command = {
  customer: { name: "Ada", email: "ada@example.com" },
  items: [{ sku: "KEYBOARD", quantity: 1 }],
  paymentToken: "tok_test_4242"
};

test("modules import only shared code, never another module", () => {
  for (const moduleName of modules) {
    for (const { file, source } of moduleSources(moduleName)) {
      const imports = [...source.matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
      for (const path of imports) {
        assert.match(path, /^\.\.\/shared\//, `${file} imports ${path}`);
      }
    }
  }
});

test("modules touch only database collections they own", () => {
  for (const moduleName of modules) {
    for (const { file, source } of moduleSources(moduleName)) {
      const used = new Set([...source.matchAll(/this\.database\.(\w+)/g)].map((match) => match[1]));
      for (const collection of used) {
        assert.ok(
          ownedCollections[moduleName].includes(collection),
          `${file} reads database.${collection}, owned by another module`
        );
      }
    }
  }
});

test("payment provider and repositories stay behind their module boundary", () => {
  for (const moduleName of modules.filter((name) => name !== "payments")) {
    for (const { file, source } of moduleSources(moduleName)) {
      assert.doesNotMatch(source, /PaymentProvider/, `${file} references the payment provider`);
    }
  }
  for (const moduleName of modules.filter((name) => name !== "orders")) {
    for (const { file, source } of moduleSources(moduleName)) {
      assert.doesNotMatch(source, /orderRepository|OrderRepository/, `${file} uses the Orders repository`);
    }
  }
});

test("email outage does not fail a paid checkout", async () => {
  const app = createApplication({
    database: createDatabase(),
    paymentProvider: successfulPaymentProvider,
    notificationProvider: {
      async sendEmail() {
        throw new ExternalDependencyError("Mail unavailable", "TestMail");
      }
    },
    config: {
      payment: { normalMinMs: 0, normalMaxMs: 0, slowMinMs: 0, slowMaxMs: 0, slowRate: 0, failureRate: 0 },
      notification: { minMs: 0, maxMs: 0, failureRate: 0, dispatchIntervalMs: 0, maxAttempts: 2 }
    }
  });

  const result = await app.services.checkout.checkout(command);
  assert.equal(result.order.status, "COMPLETED");
  assert.equal(app.database.products.get("KEYBOARD").stock, 11);

  assert.deepEqual(await app.services.notifications.dispatchPending(), { sent: 0, retrying: 1, failed: 0 });
  assert.deepEqual(await app.services.notifications.dispatchPending(), { sent: 0, retrying: 0, failed: 1 });
  assert.equal(app.services.orders.requireOrder(result.order.id).status, "COMPLETED");
});

test("checkout latency does not include email delivery", { timeout: 1000 }, async () => {
  const app = createApplication({
    database: createDatabase(),
    paymentProvider: successfulPaymentProvider,
    notificationProvider: { sendEmail: () => new Promise(() => {}) }
  });

  const result = await app.services.checkout.checkout(command);
  assert.equal(result.order.status, "COMPLETED");
  assert.equal(result.notification.status, "QUEUED");
});
