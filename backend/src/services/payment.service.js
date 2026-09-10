/**
 * Paystack payment business logic (Backend Stage 5).
 *
 * SECURITY / ARCHITECTURE (see docs/API_STAGE5.md for the full writeup):
 *  - The order amount/currency ALWAYS come from the existing Order row
 *    (itself server-priced from Course.price back in Stage 3) — never
 *    from the frontend, never from the Paystack request body alone.
 *  - Every Paystack response is independently verified against Paystack
 *    (GET /transaction/verify/:reference) before anything is trusted —
 *    never the frontend's word, never the webhook body alone.
 *  - This file NEVER awards cashback/commission/enrollment itself. Once
 *    a payment is confirmed genuinely successful, it calls the EXISTING
 *    Stage 3/4 pipeline (orderService.handleSuccessfulPurchase), which is
 *    itself idempotent — see order.service.js / financialPipeline.service.js.
 *    This file adds its OWN idempotency guard in front of that (see
 *    applyVerificationResult) so a payment already marked SUCCESSFUL is
 *    never re-verified against Paystack at all.
 */
"use strict";

const crypto = require("crypto");
const { prisma } = require("../database/client");
const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");
const money = require("../utils/money");
const orderService = require("./order.service");
const paystackService = require("./paystack.service");
// Lazy-required inside handleTransferWebhookEvent to avoid any risk of a
// circular require (withdrawal.service.js does not require this file,
// but keeping the transfer-webhook dependency lazy/local keeps the two
// services' load order fully independent regardless of future changes).
const { todayStamp, formatId } = require("../utils/financeIdGenerator");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_REFERENCE_ATTEMPTS = 8;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

function dateRangeWhere(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return Object.keys(range).length ? range : undefined;
}

/** Generate a unique Paystack transaction reference, mirroring order.service.js's retry-forward-on-collision pattern. */
async function generateReference() {
  let lastError;
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    const stamp = todayStamp();
    const countToday = await prisma.payment.count({
      where: { providerReference: { startsWith: `PAY-${stamp}-` } },
    });
    const reference = formatId("PAY", stamp, countToday + 1 + attempt);
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.payment.findUnique({ where: { providerReference: reference } });
    if (!existing) return reference;
    lastError = new Error("Reference collision");
  }
  throw lastError || ApiError.internal("Failed to generate a unique payment reference.");
}

/**
 * Initialize a Paystack payment for an order the authenticated user owns.
 * See "Payment Initialization" — the amount/currency sent to Paystack is
 * ALWAYS read from the order, never accepted from the request body.
 */
async function initializePayment({ orderId, userId, userEmail }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found.");
  }

  // Ownership: an explicit 403 here (unlike order.service.js's
  // notFound-shaped ownership check) is a deliberate Stage 5 requirement
  // — see docs/API_STAGE5.md "Order Ownership".
  if (order.userId !== userId) {
    throw ApiError.forbidden("You can only initialize payment for your own order.");
  }

  if (order.status === "PAID") {
    throw ApiError.badRequest("This order has already been paid for.");
  }
  if (order.status === "CANCELLED") {
    throw ApiError.badRequest("This order has been cancelled and can no longer be paid.");
  }
  // Deliberately NOT rejecting order.status === "FAILED" beyond what the
  // check above already allows through — see "Payment Retry": a prior
  // failed/abandoned Paystack ATTEMPT must not permanently block retrying
  // the same order (only order.service.js's own terminal states do).

  const reference = await generateReference();
  const amountSubunit = money.toSubunit(order.amount);

  const paystackData = await paystackService.initializeTransaction({
    email: userEmail,
    amountSubunit,
    currency: order.currency,
    reference,
    callbackUrl: config.paystack.callbackUrl || undefined,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      userId: order.userId,
      provider: "PAYSTACK",
      providerReference: reference,
      amount: order.amount,
      currency: order.currency,
      status: "INITIALIZED",
    },
  });

  // Keep Order.paymentReference pointing at the most recent attempt —
  // full history of every attempt still lives in the Payment table (see
  // "Payment Retry" / "preserve payment history").
  await prisma.order.update({ where: { id: order.id }, data: { paymentReference: reference } });

  logger.info(`Payment initialized: reference=${reference} order=${order.orderNumber} user=${userId}`);

  return {
    payment,
    authorizationUrl: paystackData.authorization_url,
    accessCode: paystackData.access_code,
    reference: paystackData.reference || reference,
  };
}

/**
 * Core verification logic shared by the /verify endpoint and the webhook
 * handler (see platform rule "No Duplicated Financial Logic" — Stage 5
 * §62: neither caller re-implements this, both call it).
 *
 * `payment` must already be loaded from the database. Independently
 * verifies against Paystack's API, cross-checks amount/currency against
 * the order, and — only on a genuine match — hands off to the EXISTING
 * Stage 3/4 successful-purchase pipeline.
 *
 * Returns { outcome, payment, order } where outcome is one of:
 *   "SUCCESS" | "PENDING" | "FAILED" | "REJECTED_MISMATCH"
 */
async function applyVerificationResult(payment) {
  // Idempotency guard #1: a payment already recorded SUCCESSFUL is never
  // re-sent to Paystack — avoids redundant API calls and guarantees a
  // second verify/webhook delivery is always a safe, side-effect-free no-op.
  if (payment.status === "SUCCESSFUL") {
    const order = await prisma.order.findUnique({ where: { id: payment.orderId }, include: { enrollment: true } });
    return { outcome: "SUCCESS", payment, order, alreadyProcessed: true };
  }

  const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found for this payment.");
  }

  logger.info(`Payment verification attempted: reference=${payment.providerReference}`);
  const data = await paystackService.verifyTransaction(payment.providerReference);

  // --- Provider-reported non-success states -----------------------------
  if (data.status !== "success") {
    const gatewayStatus = data.status === "abandoned" || data.status === "pending" ? "PENDING" : "FAILED";
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: gatewayStatus,
        channel: data.channel || undefined,
        gatewayResponse: data.gateway_response || data.message || undefined,
        verifiedAt: new Date(),
      },
    });
    logger.info(`Payment verification result: reference=${payment.providerReference} providerStatus=${data.status}`);
    return { outcome: gatewayStatus === "PENDING" ? "PENDING" : "FAILED", payment: updated, order };
  }

  // --- CRITICAL SECURITY CHECK: amount + currency must match the order ---
  // Never trust the gateway response without comparing it to the
  // server-calculated expected order amount (see "Amount Matching").
  const paidAmount = money.fromSubunit(data.amount);
  const amountMatches = money.equals(paidAmount, order.amount);
  const currencyMatches = typeof data.currency === "string" && data.currency.toUpperCase() === order.currency.toUpperCase();

  if (!amountMatches || !currencyMatches) {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        channel: data.channel || undefined,
        gatewayResponse: "Rejected — amount/currency did not match the order.",
        verifiedAt: new Date(),
      },
    });
    logger.warn(
      `Payment REJECTED (mismatch): reference=${payment.providerReference} order=${order.orderNumber} ` +
        `expected=${order.amount.toString()} ${order.currency} got=${paidAmount.toString()} ${data.currency}`
    );
    return { outcome: "REJECTED_MISMATCH", payment: updated, order };
  }

  // --- Idempotency guard #2: an order that somehow already transitioned
  // to PAID (e.g. via a concurrent webhook delivery) is safe to re-hit —
  // handleSuccessfulPurchase() is itself idempotent (see order.service.js). ---
  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCESSFUL",
      channel: data.channel || undefined,
      gatewayResponse: data.gateway_response || undefined,
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
      verifiedAt: new Date(),
      metadata: { paystackId: data.id, ipAddress: data.ip_address || null },
    },
  });

  const paidOrder = await orderService.handleSuccessfulPurchase(order.id, {
    paymentReference: payment.providerReference,
  });

  logger.info(`Payment verified SUCCESSFUL: reference=${payment.providerReference} order=${order.orderNumber}`);

  return { outcome: "SUCCESS", payment: updatedPayment, order: paidOrder };
}

async function findPaymentByReferenceOrThrow(reference) {
  const payment = await prisma.payment.findUnique({ where: { providerReference: reference } });
  if (!payment) {
    // Deliberately vague per "Unknown Reference" — never confirms/denies
    // details about a reference that isn't ours.
    throw ApiError.notFound("Payment reference not found.");
  }
  return payment;
}

/** GET/POST /payments/paystack/verify/:reference */
async function verifyPayment({ reference, userId, isAdmin = false }) {
  const payment = await findPaymentByReferenceOrThrow(reference);
  if (!isAdmin && payment.userId !== userId) {
    // Same not-found shape as order ownership checks elsewhere in the
    // app — never lets a user probe for the existence of someone else's
    // payment reference.
    throw ApiError.notFound("Payment reference not found.");
  }

  const result = await applyVerificationResult(payment);

  if (result.outcome === "REJECTED_MISMATCH") {
    throw ApiError.badRequest("Payment verification failed: the payment does not match the expected order.");
  }

  return result;
}

/**
 * POST /payments/paystack/webhook
 * Verifies the x-paystack-signature header (HMAC-SHA512 of the RAW body,
 * keyed with the Paystack secret key — see docs/API_STAGE5.md) before
 * trusting anything in the payload. Only the `charge.success` event
 * triggers processing; all other recognized events are acknowledged
 * without touching any financial record.
 */
async function handleWebhookEvent({ rawBody, signature }) {
  if (!rawBody || !signature) {
    logger.warn("Webhook rejected: missing signature or body.");
    throw ApiError.unauthorized("Invalid webhook signature.");
  }

  const expected = crypto.createHmac("sha512", config.paystack.secretKey).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(String(signature), "utf8");
  const signatureValid =
    expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!signatureValid) {
    logger.warn("Webhook rejected: invalid signature.");
    throw ApiError.unauthorized("Invalid webhook signature.");
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    logger.warn("Webhook rejected: malformed JSON body.");
    throw ApiError.badRequest("Malformed webhook payload.");
  }

  const event = body.event;
  logger.info(`Webhook accepted: event=${event}`);

  // Transfer (withdrawal payout) events — Phase 11. Kept in the SAME
  // webhook handler/route as course-payment events per spec §8 ("extend
  // the existing webhook handler"), just branching by event name. The
  // charge.success path below is completely unmodified.
  if (event === "transfer.success" || event === "transfer.failed" || event === "transfer.reversed") {
    return handleTransferWebhookEvent(event, body.data);
  }

  // We only need the successful-charge event to drive the purchase
  // pipeline — see "Webhook Events". Everything else is acknowledged
  // (200) without changing any financial record.
  if (event !== "charge.success") {
    return { acknowledged: true, processed: false, event };
  }

  const reference = body.data && body.data.reference;
  if (!reference) {
    logger.warn("Webhook rejected: charge.success event missing a reference.");
    return { acknowledged: true, processed: false, event };
  }

  const payment = await prisma.payment.findUnique({ where: { providerReference: reference } });
  if (!payment) {
    // "Unknown Reference": never create an order/payment/financial
    // record from an inbound webhook — only respond and move on.
    logger.warn(`Webhook ignored: unknown payment reference=${reference}`);
    return { acknowledged: true, processed: false, event };
  }

  if (payment.status === "SUCCESSFUL") {
    logger.info(`Webhook ignored: reference=${reference} already processed (duplicate delivery).`);
    return { acknowledged: true, processed: false, event, alreadyProcessed: true };
  }

  const result = await applyVerificationResult(payment);
  return { acknowledged: true, processed: result.outcome === "SUCCESS", event, outcome: result.outcome };
}

/**
 * Handles transfer.success / transfer.failed / transfer.reversed events
 * (Phase 11 spec §8/§9). The withdrawal is looked up by the Paystack
 * transfer `reference` — which is always OUR own value, generated at
 * withdrawal-request time (see withdrawal.service.js#createWithdrawal),
 * never a value we have to trust Paystack to have kept unique for us.
 *
 * Idempotency: both branches below go through withdrawal.service.js
 * functions whose actual duplicate-protection is an atomic conditional
 * `updateMany` keyed on the withdrawal's CURRENT status — a duplicate
 * webhook delivery always matches zero rows on its second arrival and is
 * a safe no-op (see withdrawal.service.js#reverseAndFailWithdrawal /
 * #completeWithdrawal for the exact mechanism).
 */
async function handleTransferWebhookEvent(event, data) {
  const reference = data && data.reference;
  if (!reference) {
    logger.warn(`Transfer webhook rejected: ${event} missing a reference.`);
    return { acknowledged: true, processed: false, event };
  }

  const withdrawal = await prisma.withdrawal.findUnique({ where: { reference } });
  if (!withdrawal) {
    // Never create/guess a withdrawal from an inbound webhook — same
    // "Unknown Reference" rule as the course-payment webhook above.
    logger.warn(`Transfer webhook ignored: unknown withdrawal reference=${reference}`);
    return { acknowledged: true, processed: false, event };
  }

  // eslint-disable-next-line global-require
  const withdrawalService = require("./withdrawal.service");

  if (event === "transfer.success") {
    if (withdrawal.status !== "PROCESSING") {
      logger.info(`Transfer webhook ignored: withdrawal=${withdrawal.withdrawalId} already in status=${withdrawal.status} (duplicate delivery).`);
      return { acknowledged: true, processed: false, event, alreadyProcessed: true };
    }
    // System-triggered completion — no adminId (this is Paystack telling
    // us the money moved, not an admin action), but still goes through
    // the exact same terminal-state machine as the manual complete path.
    await withdrawalService.completeWithdrawal({
      adminId: null,
      withdrawalId: withdrawal.id,
      _verifiedTransfer: { status: "success" },
    });
    logger.info(`Transfer confirmed SUCCESSFUL via webhook: withdrawal=${withdrawal.withdrawalId}`);
    return { acknowledged: true, processed: true, event };
  }

  // transfer.failed / transfer.reversed
  if (withdrawal.status === "FAILED" || withdrawal.status === "COMPLETED") {
    logger.info(`Transfer failure webhook ignored: withdrawal=${withdrawal.withdrawalId} already in a terminal status=${withdrawal.status} (duplicate delivery).`);
    return { acknowledged: true, processed: false, event, alreadyProcessed: true };
  }

  const reason = (data && (data.failure_reason || data.gateway_response || data.message)) || `Paystack reported ${event}.`;
  await withdrawalService.reverseAndFailWithdrawal({
    withdrawalId: withdrawal.id,
    reason,
    extraData: { transferCode: data.transfer_code || withdrawal.transferCode },
  });
  logger.warn(`Transfer FAILED via webhook, balance reversed: withdrawal=${withdrawal.withdrawalId} reason=${reason}`);
  return { acknowledged: true, processed: true, event };
}

async function getPaymentByReference(reference, { userId, isAdmin = false } = {}) {
  const payment = await prisma.payment.findUnique({
    where: { providerReference: reference },
    include: { order: { include: { course: true } }, user: true },
  });
  if (!payment) {
    throw ApiError.notFound("Payment reference not found.");
  }
  if (!isAdmin && payment.userId !== userId) {
    throw ApiError.notFound("Payment reference not found.");
  }
  return payment;
}

async function listPaymentsForUser(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);
  const where = { userId };
  if (query.status) where.status = query.status;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { order: { include: { course: true } } },
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function listPaymentsAdmin(query = {}) {
  const { take, skip, page } = paginationArgs(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.userId) where.userId = query.userId;
  if (query.orderId) where.orderId = query.orderId;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  if (query.search) {
    where.OR = [
      { providerReference: { contains: query.search, mode: "insensitive" } },
      { order: { orderNumber: { contains: query.search, mode: "insensitive" } } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
      { order: { course: { title: { contains: query.search, mode: "insensitive" } } } },
    ];
  }
  if (query.courseId) {
    where.order = { ...(where.order || {}), courseId: query.courseId };
  }

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { order: { include: { course: true } }, user: true },
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

module.exports = {
  initializePayment,
  verifyPayment,
  handleWebhookEvent,
  getPaymentByReference,
  listPaymentsForUser,
  listPaymentsAdmin,
};
