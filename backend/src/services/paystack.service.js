/**
 * Low-level Paystack API client (Backend Stage 5).
 *
 * This file ONLY knows how to talk to Paystack's HTTP API — it holds no
 * order/payment/financial business logic (that lives in
 * payment.service.js, which is the only caller of this module). See
 * https://paystack.com/docs/api/transaction/ for the endpoints used here.
 *
 * SECURITY: config.paystack.secretKey is read here and attached to the
 * Authorization header of every request. It is never logged, never
 * included in a thrown error's message, and never returned to a caller.
 */
"use strict";

const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

/**
 * Perform an authenticated request against the Paystack API with a
 * bounded timeout (see "Timeouts" — never let a gateway request hang
 * indefinitely). Network failures, timeouts, and non-2xx Paystack
 * responses are all normalized into a clean ApiError; the underlying
 * technical detail is logged server-side only.
 */
async function paystackRequest(path, { method = "GET", body } = {}) {
  if (!config.paystack.secretKey) {
    // Fails loudly for whoever is operating the server, but this is an
    // operational/config error — never a message shown to an end user
    // as-is (ApiError.internal keeps isOperational=false -> generic
    // response body, full detail only in the server log).
    logger.error("Paystack secret key is not configured (PAYSTACK_SECRET_KEY).");
    throw ApiError.internal("Payment provider is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.paystack.requestTimeoutMs);

  let response;
  try {
    response = await fetch(`${config.paystack.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      logger.error(`Paystack request timed out: ${method} ${path}`);
      throw ApiError.internal("Payment provider request timed out. Please try again.");
    }
    logger.error(`Paystack request failed: ${method} ${path} — ${err.message}`);
    throw ApiError.internal("Could not reach the payment provider. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    logger.error(`Paystack returned a non-JSON response: ${method} ${path} (status ${response.status})`);
    throw ApiError.internal("Payment provider returned an invalid response.");
  }

  if (!response.ok || payload.status !== true) {
    // Paystack's error `message` is safe to surface (e.g. "Invalid key",
    // "Transaction reference not found") — it never contains secrets.
    logger.warn(`Paystack API error: ${method} ${path} — ${payload.message || response.status}`);
    throw ApiError.badRequest(payload.message || "Payment provider request failed.");
  }

  return payload.data;
}

/**
 * Initialize a transaction. amountSubunit MUST already be the integer
 * subunit value (e.g. pesewas for GHS) — see utils/money.js#toSubunit.
 * Returns { authorization_url, access_code, reference }.
 */
async function initializeTransaction({ email, amountSubunit, currency, reference, callbackUrl, metadata }) {
  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: {
      email,
      amount: String(amountSubunit),
      currency,
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
    },
  });
}

/** Verify a transaction by reference. Returns Paystack's full transaction data object. */
async function verifyTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
}

/**
 * List Paystack's own valid banks/mobile-money networks for Ghana. Used
 * to validate a submitted bank/network code against Paystack's real,
 * live list instead of a hardcoded/guessed one (see Phase 11 spec §3/§5
 * — "Do NOT guess bank codes"). `type` is "ghipss" for bank accounts or
 * "mobile_money" for Mobile Money, matching Paystack's own /bank query
 * parameter for Ghana. https://paystack.com/docs/api/miscellaneous/#bank
 */
async function listGhanaBanks(type) {
  const data = await paystackRequest(`/bank?currency=GHS&type=${encodeURIComponent(type)}`, { method: "GET" });
  return Array.isArray(data) ? data : [];
}

/**
 * Create a Paystack Transfer Recipient. `type` is "mobile_money" or
 * "ghipss"; `accountNumber` is the phone number (Mobile Money) or bank
 * account number; `bankCode` must be a code returned by listGhanaBanks
 * above. Returns Paystack's recipient object, including recipient_code.
 * https://paystack.com/docs/api/transfer-recipient/#create
 */
async function createTransferRecipient({ type, name, accountNumber, bankCode }) {
  return paystackRequest("/transferrecipient", {
    method: "POST",
    body: {
      type,
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "GHS",
    },
  });
}

/**
 * Initiate a Transfer to a previously-created recipient. amountSubunit
 * MUST already be the integer pesewas value (see utils/money.js#toSubunit)
 * of the NET payout — never the gross withdrawal amount. `reference` is
 * OUR unique, caller-generated idempotency key (never a random value
 * that could collide — see Withdrawal.reference).
 * https://paystack.com/docs/api/transfer/#initiate
 */
async function initiateTransfer({ amountSubunit, recipientCode, reference, reason }) {
  return paystackRequest("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: String(amountSubunit),
      recipient: recipientCode,
      reference,
      reason,
    },
  });
}

/**
 * Independently re-check a transfer's real status with Paystack — used
 * by the manual admin "complete" action so it can never mark a
 * withdrawal COMPLETED without the backend itself confirming success
 * (Phase 11 spec §17), the same "never trust the caller, always
 * re-verify" pattern already used for course-payment verification.
 * https://paystack.com/docs/api/transfer/#fetch
 */
async function fetchTransfer(idOrCode) {
  return paystackRequest(`/transfer/${encodeURIComponent(idOrCode)}`, { method: "GET" });
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  listGhanaBanks,
  createTransferRecipient,
  initiateTransfer,
  fetchTransfer,
};
