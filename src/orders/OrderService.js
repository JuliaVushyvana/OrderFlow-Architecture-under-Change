import { DomainError } from "../shared/errors.js";
import { calculateOrderTotal } from "../shared/money.js";

export class OrderService {
  constructor(orderRepository, catalog) {
    this.orderRepository = orderRepository;
    this.catalog = catalog;
  }

  createDraft({ customer, items }) {
    if (!customer?.email || !customer.email.includes("@")) {
      throw new DomainError("A valid customer email is required", "INVALID_CUSTOMER");
    }

    const normalizedItems = items.map(({ sku, quantity }) => ({ sku, quantity }));
    const totalCents = calculateOrderTotal(normalizedItems, this.catalog.priceList());
    return this.orderRepository.create({
      customer: { email: customer.email, name: customer.name ?? "Customer" },
      items: normalizedItems,
      totalCents,
      currency: "USD"
    });
  }

  markInventoryReserved(orderId) {
    return this.#update(orderId, { inventoryStatus: "RESERVED" });
  }

  markPaid(orderId, paymentId) {
    return this.#update(orderId, { paymentStatus: "PAID", paymentId });
  }

  complete(orderId) {
    const order = this.requireOrder(orderId);
    if (order.paymentStatus !== "PAID" || order.inventoryStatus !== "RESERVED") {
      throw new DomainError("Order is not ready to complete", "ORDER_NOT_READY", 409);
    }
    return this.#update(orderId, { status: "COMPLETED", completedAt: new Date().toISOString() });
  }

  fail(orderId, reason) {
    return this.#update(orderId, { status: "FAILED", failureReason: reason });
  }

  requireOrder(orderId) {
    const order = this.orderRepository.findById(orderId);
    if (!order) throw new DomainError("Order not found", "ORDER_NOT_FOUND", 404);
    return order;
  }

  list({ status } = {}) {
    const orders = this.orderRepository.list();
    return status ? orders.filter((order) => order.status === status) : orders;
  }

  #update(orderId, changes) {
    return this.orderRepository.save({ ...this.requireOrder(orderId), ...changes });
  }
}
