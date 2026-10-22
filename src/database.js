const seedProducts = [
  { sku: "KEYBOARD", name: "Mechanical keyboard", priceCents: 8900, stock: 12 },
  { sku: "MOUSE", name: "Wireless mouse", priceCents: 3900, stock: 25 },
  { sku: "MONITOR", name: "27-inch monitor", priceCents: 27900, stock: 8 }
];

export class InMemoryDatabase {
  constructor(products = seedProducts) {
    this.products = new Map(products.map((product) => [product.sku, { ...product }]));
    this.orders = new Map();
    this.payments = new Map();
    this.inventoryOperations = new Map();
    this.notifications = [];
    this.notificationOutbox = [];
    this.sequences = { order: 0, payment: 0 };
  }

  nextId(type) {
    this.sequences[type] += 1;
    return `${type}_${String(this.sequences[type]).padStart(4, "0")}`;
  }

  snapshot() {
    return {
      products: structuredClone([...this.products.values()]),
      orders: structuredClone([...this.orders.values()]),
      payments: structuredClone([...this.payments.values()]),
      inventoryOperations: structuredClone([...this.inventoryOperations.values()]),
      notifications: structuredClone(this.notifications),
      notificationOutbox: structuredClone(this.notificationOutbox)
    };
  }
}

export function createDatabase(products) {
  return new InMemoryDatabase(products);
}
