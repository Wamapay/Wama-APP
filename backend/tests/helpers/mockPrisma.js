"use strict";

/**
 * Builds a fresh mock Prisma client for a single test file. Each model
 * exposes the methods our services actually call, as jest.fn()s, so
 * tests can configure return values / assert call arguments without a
 * real database connection.
 */
function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    agent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    referral: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adminActivity: {
      create: jest.fn(),
    },

    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },

    // Defaults match the pre-Settings-feature hardcoded constants exactly
    // (20% cashback, 40% commission, 20-referral threshold, 5% withdrawal
    // fee, the original 3-tier reward table) so every existing test's
    // expected numbers keep working unchanged unless a test explicitly
    // overrides this mock to exercise a different configured value.
    platformSettings: {
      upsert: jest.fn().mockResolvedValue({
        id: "platform-settings-singleton",
        cashbackRatePercent: "20",
        commissionRatePercent: "40",
        verificationThreshold: 20,
        withdrawalFeeRatePercent: "5",
        rewardTiers: [
          { milestone: 10, amount: "50" },
          { milestone: 15, amount: "75" },
          { milestone: 20, amount: "100" },
        ],
        featuresEnabled: {
          courses: true,
          referrals: true,
          cashback: true,
          rewards: true,
          withdrawals: true,
          reviews: true,
        },
        visibleSections: {
          cashbackBalance: true,
          commissionBalance: true,
          rewardBalance: true,
          withdrawableBalance: true,
          transactionHistory: true,
          withdrawalSection: true,
          withdrawalMethods: true,
          referralSection: true,
          referralLink: true,
          referralStats: true,
          referralCommissionDisplay: true,
        },
      }),
      update: jest.fn(),
    },

    // --- Backend Stage 3: courses, content, purchases ------------------
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    course: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    module: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    lesson: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    lessonProgress: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    fileAsset: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    review: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },

    // --- Backend Stage 4: financial engine ------------------------------
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    reward: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    withdrawal: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    paystackRecipient: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },

    // --- Backend Stage 5: Paystack payments -----------------------------
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },

    $transaction: jest.fn(),
  };
}

/**
 * Wires up createPrismaMock()'s `$transaction` so it transparently
 * supports both call shapes our services use:
 *   - prisma.$transaction([...])              (array of promises)
 *   - prisma.$transaction(async (tx) => {...}) (interactive callback)
 * For the callback form, `tx` is the same mock client — so tests can
 * configure model mocks exactly as if no transaction were involved.
 */
function withDefaultTransaction(prismaMock) {
  prismaMock.$transaction.mockImplementation((arg) => {
    if (typeof arg === "function") {
      return arg(prismaMock);
    }
    return Promise.all(arg);
  });
  return prismaMock;
}

module.exports = { createPrismaMock, withDefaultTransaction };
