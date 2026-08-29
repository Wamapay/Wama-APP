/**
 * Week boundary for weekly referral milestone rewards (see
 * reward.service.js#evaluateReferralRewards).
 *
 * A single, explicit, timezone-aware definition is used platform-wide so
 * "10 successful referrals in a week" always means the same week for
 * everyone — never left to each caller's local clock.
 *
 * Week = Monday 00:00:00 through Sunday 23:59:59.999, in the configured
 * timezone offset (REWARD_WEEK_UTC_OFFSET_MINUTES, default 0 = UTC).
 */
"use strict";

const OFFSET_MINUTES = parseInt(process.env.REWARD_WEEK_UTC_OFFSET_MINUTES, 10) || 0;

/**
 * Returns { weekStart, weekEnd } as real Date objects (stored/compared
 * in UTC, as Prisma/Postgres always do) representing the Monday–Sunday
 * week containing `date`, shifted by the configured timezone offset.
 */
function getWeekBoundaries(date = new Date()) {
  const shifted = new Date(date.getTime() + OFFSET_MINUTES * 60 * 1000);

  const dayOnly = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
  const dayOfWeek = dayOnly.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const localWeekStart = new Date(dayOnly);
  localWeekStart.setUTCDate(dayOnly.getUTCDate() + diffToMonday);

  const localWeekEnd = new Date(localWeekStart);
  localWeekEnd.setUTCDate(localWeekStart.getUTCDate() + 6);
  localWeekEnd.setUTCHours(23, 59, 59, 999);

  // Shift back from "local" (offset-applied) time to real UTC instants.
  const weekStart = new Date(localWeekStart.getTime() - OFFSET_MINUTES * 60 * 1000);
  const weekEnd = new Date(localWeekEnd.getTime() - OFFSET_MINUTES * 60 * 1000);

  return { weekStart, weekEnd };
}

module.exports = { getWeekBoundaries };
