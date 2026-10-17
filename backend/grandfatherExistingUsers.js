/**
 * ONE-TIME grandfathering script — email verification enforcement.
 *
 * `login()` now correctly requires `emailVerified === true`. But every
 * account created BEFORE this fix has `emailVerified: false`, because no
 * real email was ever sent for them to verify with — there was nothing
 * they could have clicked. Without this script, those real, legitimate
 * accounts (including your own admin account) would be permanently
 * locked out through no fault of their own.
 *
 * This does exactly one thing: for every account that is CURRENTLY
 * unverified, mark it verified. It does not touch anything else — not
 * balances, not orders, not roles, not passwords.
 *
 * This is intentionally NOT run automatically on every deploy. It is a
 * deliberate, one-time, manually-triggered action. Running it a second
 * time is harmless (it will simply find nothing left to update), but it
 * only needs to be run once, right after this deploy goes live.
 *
 * Usage (from the Railway Console, or any environment with a real
 * DATABASE_URL configured):
 *   node scripts/grandfatherExistingUsers.js
 */
"use strict";

const { prisma, disconnectDatabase } = require("../src/database/client");

async function main() {
  const before = await prisma.user.findMany({
    where: { emailVerified: false },
    select: { id: true, email: true, createdAt: true },
  });

  if (before.length === 0) {
    console.log("[grandfather] No unverified accounts found — nothing to do.");
    return;
  }

  console.log(`[grandfather] Found ${before.length} account(s) created before email verification was enforced:`);
  before.forEach((u) => console.log(`  - ${u.email} (created ${u.createdAt.toISOString()})`));

  const result = await prisma.user.updateMany({
    where: { emailVerified: false },
    data: { emailVerified: true },
  });

  console.log(`[grandfather] Done. Marked ${result.count} account(s) as verified.`);
  console.log("[grandfather] Any NEW account created from now on still requires real email verification as normal — this script does not change that.");
}

main()
  .catch((err) => {
    console.error("[grandfather] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
