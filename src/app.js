import { config, validateConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { CheckoutService } from "./checkout/CheckoutService.js";
import { InventoryService } from "./inventory/InventoryService.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { FakeNotificationProvider } from "./notifications/FakeNotificationProvider.js";
import { OrderRepository } from "./orders/OrderRepository.js";
import { OrderService } from "./orders/OrderService.js";
import { PaymentService } from "./payments/PaymentService.js";
import { FakePaymentProvider } from "./payments/FakePaymentProvider.js";
import { ReportingService } from "./reporting/ReportingService.js";

export function createApplication(options = {}) {
  const settings = validateConfig(options.config ?? config);
  const database = options.database ?? createDatabase();
  const orderRepository = new OrderRepository(database);
  const inventoryService = new InventoryService(database);
  const orderService = new OrderService(orderRepository, inventoryService);
  const paymentProvider = options.paymentProvider ?? new FakePaymentProvider(settings.payment);
  const notificationProvider = options.notificationProvider
    ?? new FakeNotificationProvider(settings.notification);
  const paymentService = new PaymentService(database, paymentProvider);
  const notificationService = new NotificationService(database, notificationProvider, {
    maxAttempts: settings.notification.maxAttempts
  });
  const reportingService = new ReportingService(database);
  const checkoutService = new CheckoutService({
    orderService,
    inventoryService,
    paymentService,
    notificationService
  });

  return {
    database,
    services: {
      checkout: checkoutService,
      inventory: inventoryService,
      notifications: notificationService,
      orders: orderService,
      payments: paymentService,
      reporting: reportingService
    }
  };
}
