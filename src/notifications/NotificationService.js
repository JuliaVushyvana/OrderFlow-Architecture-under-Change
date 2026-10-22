import { formatMoney } from "../shared/money.js";

export class NotificationService {
  constructor(database, provider, { maxAttempts = 5 } = {}) {
    this.database = database;
    this.provider = provider;
    this.maxAttempts = maxAttempts;
    this.dispatching = false;
  }

  enqueueOrderConfirmation(order) {
    // Checkout only records the intent; delivery happens outside the critical path.
    const entry = {
      id: `outbox_${crypto.randomUUID()}`,
      orderId: order.id,
      channel: "EMAIL",
      template: "ORDER_CONFIRMATION_V1",
      message: this.#renderOrderConfirmation(order),
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    this.database.notificationOutbox.push(entry);
    return { orderId: entry.orderId, template: entry.template, status: "QUEUED" };
  }

  async dispatchPending() {
    if (this.dispatching) return { skipped: true };
    this.dispatching = true;
    const summary = { sent: 0, retrying: 0, failed: 0 };
    try {
      const pending = this.database.notificationOutbox.filter((entry) => entry.status === "PENDING");
      for (const entry of pending) {
        entry.status = "SENDING";
        entry.attempts += 1;
        try {
          const sent = await this.provider.sendEmail(entry.message);
          this.database.notifications.push({
            id: sent.providerMessageId,
            orderId: entry.orderId,
            channel: entry.channel,
            template: entry.template,
            status: "SENT",
            latencyMs: sent.latencyMs,
            attempts: entry.attempts,
            sentAt: new Date().toISOString()
          });
          entry.status = "SENT";
          summary.sent += 1;
        } catch (error) {
          entry.lastError = error.message;
          entry.status = entry.attempts >= this.maxAttempts ? "FAILED" : "PENDING";
          summary[entry.status === "FAILED" ? "failed" : "retrying"] += 1;
        }
      }
      return summary;
    } finally {
      this.dispatching = false;
    }
  }

  #renderOrderConfirmation(order) {
    // Marketing edits this template often; changing it no longer touches the checkout path.
    return {
      to: order.customer.email,
      subject: `Order ${order.id} confirmed`,
      body: `Thanks ${order.customer.name}. Your total is ${formatMoney(order.totalCents)}.`
    };
  }
}
