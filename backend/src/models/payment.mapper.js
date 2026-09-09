/**
 * DTO / response-shaping helpers for payments (Backend Stage 5) —
 * mirrors the pattern in finance.mapper.js / course.mapper.js. Never
 * exposes Paystack secret keys or raw internal gateway payloads beyond a
 * small, safe metadata subset (see payment.service.js).
 */
"use strict";

function toNumber(value) {
  if (value === null || value === undefined) return value;
  return Number(value);
}

function toPublicPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    reference: payment.providerReference,
    provider: payment.provider,
    order: payment.order
      ? {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          course: payment.order.course
            ? { id: payment.order.course.id, title: payment.order.course.title }
            : undefined,
        }
      : undefined,
    amount: toNumber(payment.amount),
    currency: payment.currency,
    status: payment.status,
    channel: payment.channel || undefined,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt || undefined,
  };
}

function toAdminPayment(payment) {
  if (!payment) return null;
  return {
    ...toPublicPayment(payment),
    userId: payment.userId,
    user: payment.user
      ? { id: payment.user.id, fullName: payment.user.fullName, email: payment.user.email }
      : undefined,
    gatewayResponse: payment.gatewayResponse || undefined,
    verifiedAt: payment.verifiedAt || undefined,
    updatedAt: payment.updatedAt,
  };
}

module.exports = { toPublicPayment, toAdminPayment };
