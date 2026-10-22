import { DomainError, ExternalDependencyError } from "../shared/errors.js";

export class PaymentService {
  constructor(database, provider) {
    this.database = database;
    this.provider = provider;
  }

  async chargeOrder({ orderId, amountCents, currency, paymentToken }) {
    // Explicit contract: the caller passes what Payments needs instead of Payments reading Orders data.
    if (!orderId || !Number.isInteger(amountCents) || amountCents < 1 || !currency) {
      throw new DomainError("Invalid payment request", "INVALID_PAYMENT_REQUEST");
    }

    const existing = [...this.database.payments.values()].find(
      (payment) => payment.orderId === orderId && payment.status === "CAPTURED"
    );
    if (existing) return structuredClone(existing);

    if (!paymentToken) {
      throw new DomainError("Payment token is required", "PAYMENT_TOKEN_REQUIRED");
    }

    const payment = {
      id: this.database.nextId("payment"),
      orderId,
      amountCents,
      currency,
      status: "PROCESSING",
      createdAt: new Date().toISOString()
    };
    this.database.payments.set(payment.id, payment);

    try {
      const providerResult = await this.provider.charge({
        amountCents,
        currency,
        reference: orderId,
        paymentToken
      });
      const captured = {
        ...payment,
        status: "CAPTURED",
        provider: providerResult.provider,
        providerPaymentId: providerResult.providerPaymentId,
        providerLatencyMs: providerResult.latencyMs,
        capturedAt: new Date().toISOString()
      };
      this.database.payments.set(payment.id, captured);
      return structuredClone(captured);
    } catch (error) {
      this.database.payments.set(payment.id, {
        ...payment,
        status: "FAILED",
        failedAt: new Date().toISOString()
      });
      if (error instanceof ExternalDependencyError) throw error;
      throw new ExternalDependencyError("Payment provider failed", "FakePay", error);
    }
  }

  findByOrderId(orderId) {
    const payment = [...this.database.payments.values()].find((entry) => entry.orderId === orderId);
    return payment ? structuredClone(payment) : null;
  }
}
