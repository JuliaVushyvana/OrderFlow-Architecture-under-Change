function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: numberFromEnv("PORT", 3000),
  payment: {
    normalMinMs: numberFromEnv("PAYMENT_NORMAL_MIN_MS", 100),
    normalMaxMs: numberFromEnv("PAYMENT_NORMAL_MAX_MS", 300),
    slowMinMs: numberFromEnv("PAYMENT_SLOW_MIN_MS", 1500),
    slowMaxMs: numberFromEnv("PAYMENT_SLOW_MAX_MS", 3000),
    slowRate: numberFromEnv("PAYMENT_SLOW_RATE", 0.1),
    failureRate: numberFromEnv("PAYMENT_FAILURE_RATE", 0.05)
  },
  notification: {
    minMs: numberFromEnv("NOTIFICATION_MIN_MS", 150),
    maxMs: numberFromEnv("NOTIFICATION_MAX_MS", 450),
    failureRate: numberFromEnv("NOTIFICATION_FAILURE_RATE", 0.02),
    dispatchIntervalMs: numberFromEnv("NOTIFICATION_DISPATCH_INTERVAL_MS", 1000),
    maxAttempts: numberFromEnv("NOTIFICATION_MAX_ATTEMPTS", 5)
  }
};

export function validateConfig(value = config) {
  for (const [sectionName, section] of Object.entries(value)) {
    if (sectionName === "port") continue;
    for (const [key, setting] of Object.entries(section)) {
      if (!Number.isFinite(setting) || setting < 0) {
        throw new Error(`Invalid ${sectionName}.${key} configuration`);
      }
    }
  }
  return value;
}
