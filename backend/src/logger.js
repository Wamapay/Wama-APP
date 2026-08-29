/**
 * Structured application logger (winston).
 *
 * Used for server lifecycle events, request context, and errors.
 * NEVER log secrets: passwords, JWT secrets, Paystack keys, tokens,
 * or raw financial account details.
 */
"use strict";

const winston = require("winston");
const { config } = require("./env");

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${ts} [${level}] ${stack || message}`;
  })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: config.logging.level,
  format: config.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

module.exports = logger;
