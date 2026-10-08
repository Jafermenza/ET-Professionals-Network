export function loadConfig(env = process.env) {
  const config = {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 3000),
    logLevel: env.LOG_LEVEL ?? "info",
    jwtSecret: env.JWT_SECRET,
    databaseUrl: env.DATABASE_URL
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT must be a valid TCP port.");
  if (config.nodeEnv === "production" && (!config.jwtSecret || config.jwtSecret.length < 32)) throw new Error("JWT_SECRET must be at least 32 characters in production.");
  return Object.freeze(config);
}
