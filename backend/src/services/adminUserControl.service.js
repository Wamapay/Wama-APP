/**
 * Admin-on-user control actions — the backend for the User Dashboard
 * Control Center's "manage this one customer" panel.
 *
 * Every action here reuses the SAME real systems the rest of the app
 * already uses (never a shortcut/parallel path):
 *   - course access -> enrollment.service.js's real ensureEnrollment
 *   - balance changes -> ledger.service.js's real recordTransaction
 *     (never writes to User.cashbackBalance/etc directly)
 *   - feature restriction -> platformSettings.service.js's real
 *     per-user override layer
 *   - every action is logged via admin.service.js's real audit trail
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const ledger = require("./ledger.service");
const enrollmentService = require("./enrollment.service");
const platformSettings = require("./platformSettings.service");
const { toDecimal } = require("../utils/money");
const { logAdminActivity } = require("./admin.service");

const BALANCE_TYPES = ["CASHBACK", "COMMISSION", "REWARD"];
const BALANCE_FIELD = { CASHBACK: "cashbackBalance", COMMISSION: "commissionBalance", REWARD: "rewardBalance" };

async function requireUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");
  return user;
}

// --- Course access ----------------------------------------------------

async function grantCourseAccess({ adminId, userId, courseId }) {
  await requireUser(userId);
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw ApiError.notFound("Course not found.");

  const enrollment = await prisma.$transaction((tx) =>
    enrollmentService.ensureEnrollment(tx, { userId, courseId, orderId: null })
  );

  await logAdminActivity({ adminId, action: "GRANT_COURSE_ACCESS", targetType: "Enrollment", targetId: enrollment.id });
  return enrollment;
}

/**
 * Only ever revokes access that was NOT tied to a real order —
 * `enrollment.orderId` is the existing, real signal for "admin-granted"
 * vs. "paid for" (see enrollment.service.js / the Enrollment schema).
 * A paying customer's access can never be revoked through this
 * function, by design.
 */
async function revokeCourseAccess({ adminId, userId, courseId }) {
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment) {
    throw ApiError.notFound("This user is not enrolled in that course.");
  }
  if (enrollment.orderId) {
    throw ApiError.forbidden("This access was paid for — purchased course access can never be revoked.");
  }

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: "SUSPENDED" },
  });

  await logAdminActivity({ adminId, action: "REVOKE_COURSE_ACCESS", targetType: "Enrollment", targetId: enrollment.id });
  return updated;
}

// --- Manual balance adjustment -----------------------------------------

/**
 * `amount` may be positive (credit) or negative (debit) — sign is the
 * caller's intent. Every adjustment REQUIRES a reason and always goes
 * through the real ledger (recordTransaction), never a direct balance
 * write, so it's fully auditable and shows up in the user's own
 * transaction history exactly like any other real transaction.
 */
async function adjustBalance({ adminId, userId, balanceType, amount, reason }) {
  if (!BALANCE_TYPES.includes(balanceType)) {
    throw ApiError.badRequest("balanceType must be one of CASHBACK, COMMISSION, REWARD.");
  }
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("A reason is required for every manual balance adjustment.");
  }
  const decimalAmount = toDecimal(amount);
  if (decimalAmount.isZero()) {
    throw ApiError.badRequest("Amount cannot be zero.");
  }

  const user = await requireUser(userId);

  if (decimalAmount.isNegative()) {
    const field = BALANCE_FIELD[balanceType];
    const currentBalance = toDecimal(user[field]);
    if (currentBalance.plus(decimalAmount).isNegative()) {
      throw ApiError.badRequest(
        `This would take the user's ${balanceType.toLowerCase()} balance negative. Current balance: ${currentBalance.toFixed(2)}.`
      );
    }
  }

  const { transaction } = await prisma.$transaction((tx) =>
    ledger.recordTransaction(tx, {
      userId,
      type: "ADMIN_ADJUSTMENT",
      amount: decimalAmount.abs(),
      status: "SUCCESSFUL",
      balanceType,
      referenceType: null,
      referenceId: null,
      description: `Admin adjustment: ${reason.trim()}`,
      metadata: { reason: reason.trim(), adjustedByAdminId: adminId, direction: decimalAmount.isNegative() ? "DEBIT" : "CREDIT" },
      applyBalance: true,
      balanceDelta: decimalAmount,
    })
  );

  await logAdminActivity({ adminId, action: "ADJUST_BALANCE", targetType: "User", targetId: userId });
  return transaction;
}

// --- Per-user feature restriction ---------------------------------------

async function setUserFeatureOverrides({ adminId, userId, overrides }) {
  await requireUser(userId);
  const updated = await platformSettings.updateUserFeatureOverrides(userId, overrides);
  await logAdminActivity({ adminId, action: "SET_USER_FEATURE_OVERRIDES", targetType: "User", targetId: userId });
  return updated;
}

async function setUserSectionOverrides({ adminId, userId, overrides }) {
  await requireUser(userId);
  const updated = await platformSettings.updateUserSectionOverrides(userId, overrides);
  await logAdminActivity({ adminId, action: "SET_USER_SECTION_OVERRIDES", targetType: "User", targetId: userId });
  return updated;
}

// --- Admin role assignment (Part 15) -------------------------------------

/**
 * Only an existing SUPER_ADMIN may grant SUPER_ADMIN to someone else —
 * a plain ADMIN has every permission SUPER_ADMIN has (see
 * adminPermissions.js's backward-compatibility note), but must not be
 * able to mint new SUPER_ADMINs. Every other role assignment (including
 * demoting someone back to USER) is allowed for any admin with the
 * MANAGE_ADMIN_ROLES permission.
 */
async function setUserRole({ actingAdminId, actingAdminRole, userId, role }) {
  if (role === "SUPER_ADMIN" && actingAdminRole !== "SUPER_ADMIN") {
    throw ApiError.forbidden("Only a SUPER_ADMIN can grant the SUPER_ADMIN role.");
  }
  const target = await requireUser(userId);
  if (target.id === actingAdminId && target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    throw ApiError.forbidden("You cannot demote your own account away from SUPER_ADMIN.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, role: true },
  });

  await logAdminActivity({ adminId: actingAdminId, action: "SET_USER_ROLE", targetType: "User", targetId: userId });
  return updated;
}

module.exports = {
  grantCourseAccess,
  revokeCourseAccess,
  adjustBalance,
  setUserFeatureOverrides,
  setUserSectionOverrides,
  setUserRole,
};
