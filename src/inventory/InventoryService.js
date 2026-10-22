import { DomainError } from "../shared/errors.js";

export class InventoryService {
  constructor(database) {
    this.database = database;
  }

  reserve(order) {
    const operationKey = `reserve:${order.id}`;
    const previous = this.database.inventoryOperations.get(operationKey);
    if (previous) return structuredClone(previous.result);

    for (const item of order.items) {
      const product = this.database.products.get(item.sku);
      if (!product || product.stock < item.quantity) {
        throw new DomainError(`Insufficient stock for ${item.sku}`, "INSUFFICIENT_STOCK", 409);
      }
    }

    for (const item of order.items) {
      const product = this.database.products.get(item.sku);
      this.database.products.set(item.sku, {
        ...product,
        stock: product.stock - item.quantity
      });
    }

    const result = { orderId: order.id, status: "RESERVED", items: order.items };
    this.database.inventoryOperations.set(operationKey, {
      operationKey,
      createdAt: new Date().toISOString(),
      result
    });
    return structuredClone(result);
  }

  release(order) {
    const reserveKey = `reserve:${order.id}`;
    const releaseKey = `release:${order.id}`;
    if (this.database.inventoryOperations.has(releaseKey)) return;
    if (!this.database.inventoryOperations.has(reserveKey)) return;

    for (const item of order.items) {
      const product = this.database.products.get(item.sku);
      this.database.products.set(item.sku, {
        ...product,
        stock: product.stock + item.quantity
      });
    }
    this.database.inventoryOperations.set(releaseKey, {
      operationKey: releaseKey,
      createdAt: new Date().toISOString(),
      result: { orderId: order.id, status: "RELEASED" }
    });
  }

  priceList() {
    return new Map(
      [...this.database.products.values()].map(({ sku, name, priceCents }) => [sku, { sku, name, priceCents }])
    );
  }

  listProducts() {
    return [...this.database.products.values()].map((product) => structuredClone(product));
  }
}
