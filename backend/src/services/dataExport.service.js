/**
 * Real "download a copy of my data" — replaces what was previously a
 * fake toast claiming an email would be sent. Compiles the user's
 * genuine profile, order, and transaction data into a real CSV, sent
 * as a real attachment via the existing, already-real Resend
 * integration (see email.service.js sendDataExportEmail).
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const emailService = require("./email.service");

function csvEscape(value) {
  const str = String(value === null || value === undefined ? "" : value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvSection(title, headers, rows) {
  const lines = [`=== ${title} ===`, headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

async function compileUserDataCsv(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const [orders, transactions] = await Promise.all([
    prisma.order.findMany({ where: { userId }, include: { course: { select: { title: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const profileSection = toCsvSection(
    "PROFILE",
    ["Full Name", "Email", "Phone", "Role", "Email Verified", "Joined"],
    [[user.fullName, user.email, user.phone || "", user.role, user.emailVerified, user.createdAt.toISOString()]]
  );

  const ordersSection = toCsvSection(
    "ORDERS",
    ["Order Number", "Course", "Amount", "Currency", "Status", "Date"],
    orders.map((o) => [o.orderNumber, o.course.title, o.amount, o.currency, o.status, o.createdAt.toISOString()])
  );

  const transactionsSection = toCsvSection(
    "TRANSACTIONS",
    ["Transaction ID", "Type", "Amount", "Currency", "Status", "Description", "Date"],
    transactions.map((t) => [t.transactionId, t.type, t.amount, t.currency, t.status, t.description || "", t.createdAt.toISOString()])
  );

  return [profileSection, "", ordersSection, "", transactionsSection].join("\n");
}

/**
 * Compiles the export and emails it. Returns { sent } — a failed send
 * (e.g. email provider misconfigured) is reported back rather than
 * thrown, matching how sendVerificationEmail's caller already handles
 * this same situation elsewhere.
 */
async function requestDataExport(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const csv = await compileUserDataCsv(userId);
  return emailService.sendDataExportEmail({ to: user.email, fullName: user.fullName, csv });
}

module.exports = { compileUserDataCsv, requestDataExport };
