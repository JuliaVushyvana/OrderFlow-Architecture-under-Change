import assert from "node:assert/strict";
import test from "node:test";
import { createApplication } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { ExternalDependencyError } from "../src/shared/errors.js";

const successfulPaymentProvider = {
  async charge(input) {
    return {
      ...input,
      provider: "TestPay",
      providerPaymentId: "provider_1",
      latencyMs: 1
    };
  }
};

const successfulNotificationProvider = {
  async sendEmail(input) {
    return { ...input, providerMessageId: "message_1", latencyMs: 1 };
  }
};

function buildApplication(overrides = {}) {
  return createApplication({
    database: createDatabase(),
    paymentProvider: successfulPaymentProvider,
    notificationProvider: successfulNotificationProvider,
    ...overrides
  });
}

const command = {
  customer: { name: "Ada", email: "ada@example.com" },
  items: [{ sku: "KEYBOARD", quantity: 1 }],
  paymentToken: "tok_test_4242"
};

test("checkout reserves stock, captures payment and queues confirmation", async () => {
  const app = buildApplication();
  const result = await app.services.checkout.checkout(command);

  assert.equal(result.order.status, "COMPLETED");
  assert.equal(result.order.paymentStatus, "PAID");
  assert.equal(result.payment.status, "CAPTURED");
  assert.equal(result.notification.status, "QUEUED");
  assert.equal(app.database.products.get("KEYBOARD").stock, 11);

  const dispatch = await app.services.notifications.dispatchPending();
  assert.deepEqual(dispatch, { sent: 1, retrying: 0, failed: 0 });
  assert.equal(app.database.notifications[0].status, "SENT");
});

test("payment failure marks order failed and releases stock", async () => {
  const paymentProvider = {
    async charge() {
      throw new ExternalDependencyError("Provider unavailable", "TestPay");
    }
  };
  const app = buildApplication({ paymentProvider });

  await assert.rejects(() => app.services.checkout.checkout(command), /Provider unavailable/);
  assert.equal(app.services.orders.requireOrder("order_0001").status, "FAILED");
  assert.equal(app.database.products.get("KEYBOARD").stock, 12);
});

test("duplicate inventory reservation does not reduce stock twice", () => {
  const app = buildApplication();
  const order = app.services.orders.createDraft(command);

  app.services.inventory.reserve(order);
  app.services.inventory.reserve(order);

  assert.equal(app.database.products.get("KEYBOARD").stock, 11);
});

test("reporting combines operational order and payment data", async () => {
  const app = buildApplication();
  await app.services.checkout.checkout(command);
  await app.services.notifications.dispatchPending();

  const report = app.services.reporting.buildSalesSummary();

  assert.equal(report.orderCount, 1);
  assert.equal(report.completedCount, 1);
  assert.equal(report.revenueCents, 8900);
  assert.equal(report.rows[0].notificationStatus, "SENT");
});

test("catalog and order lists return detached records", async () => {
  const app = buildApplication();
  await app.services.checkout.checkout(command);

  const products = app.services.inventory.listProducts();
  const orders = app.services.orders.list({ status: "COMPLETED" });
  products[0].stock = 999;
  orders[0].status = "CHANGED_OUTSIDE_DATABASE";

  assert.equal(app.database.products.get("KEYBOARD").stock, 11);
  assert.equal(app.services.orders.requireOrder("order_0001").status, "COMPLETED");
});
