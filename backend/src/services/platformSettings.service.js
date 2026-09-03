/**
 * Platform Settings — the editable replacements for what used to be
 * hardcoded constants (cashback %, commission %, verification threshold,
 * withdrawal fee %, reward tiers). Every calculation that used to read a
 * local constant now calls getSettings() instead, so an admin change
 * takes effect immediately for anything calculated AFTER the change —
 * it never rewrites already-recorded transactions, balances, or reward
 * history (those stay exactly as they were computed at the time).
 *
 * Single row, fixed id (SETTINGS_ID) — getSettings() upserts a
 * default-valued row on first-ever call so the rest of the app can
 * always assume a row exists.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");

const SETTINGS_ID = "platform-settings-singleton";

const DEFAULTS = {
  cashbackRatePercent: "20",
  commissionRatePercent: "40",
  verificationThreshold: 20,
  withdrawalFeeRatePercent: "5",
  rewardTiers: [
    { milestone: 10, amount: "50" },
    { milestone: 15, amount: "75" },
    { milestone: 20, amount: "100" },
  ],
  platformName: "Learn & Earn",
  logoUrl: null,
  tagline: null,
  supportEmail: null,
  supportPhone: null,
  // Every key here is a REAL, enforced gate — see the matching service
  // for exactly what each one blocks when set to false:
  //   courses     -> order.service.js createOrder (new purchases)
  //   referrals   -> commission.service.js awardCommission (referral commission)
  //   cashback    -> cashback.service.js awardCashback
  //   rewards     -> reward.service.js evaluateReferralRewards
  //   withdrawals -> withdrawal.service.js createWithdrawal (new requests)
  //   reviews     -> review.service.js upsertReview (new/updated reviews)
  featuresEnabled: {
    courses: true,
    referrals: true,
    cashback: true,
    rewards: true,
    withdrawals: true,
    reviews: true,
  },
  // Financial Dashboard Control (Part 4) — display-only. Unlike
  // featuresEnabled, none of these ever block a real action or hide
  // real data server-side; a frontend reads this to decide what to
  // render. Every key defaults to visible.
  visibleSections: {
    cashbackBalance: true,
    commissionBalance: true,
    rewardBalance: true,
    withdrawableBalance: true,
    transactionHistory: true,
    withdrawalSection: true,
    withdrawalMethods: true,
    // Referral Dashboard Control (Part 7) — same display-only pattern,
    // real referral/commission system untouched either way.
    referralSection: true,
    referralLink: true,
    referralStats: true,
    referralCommissionDisplay: true,
  },
};

const FEATURE_KEYS = Object.keys(DEFAULTS.featuresEnabled);
const SECTION_KEYS = Object.keys(DEFAULTS.visibleSections);

async function getSettings() {
  return prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULTS },
  });
}

function validateFeaturesEnabled(features) {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    throw ApiError.badRequest("featuresEnabled must be an object of feature-name -> boolean.");
  }
  const unknownKeys = Object.keys(features).filter((k) => !FEATURE_KEYS.includes(k));
  if (unknownKeys.length > 0) {
    throw ApiError.badRequest(`Unknown feature key(s): ${unknownKeys.join(", ")}. Known keys: ${FEATURE_KEYS.join(", ")}.`);
  }
  for (const [key, value] of Object.entries(features)) {
    if (typeof value !== "boolean") {
      throw ApiError.badRequest(`featuresEnabled.${key} must be true or false.`);
    }
  }
}

function validateVisibleSections(sections) {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw ApiError.badRequest("visibleSections must be an object of section-name -> boolean.");
  }
  const unknownKeys = Object.keys(sections).filter((k) => !SECTION_KEYS.includes(k));
  if (unknownKeys.length > 0) {
    throw ApiError.badRequest(`Unknown section key(s): ${unknownKeys.join(", ")}. Known keys: ${SECTION_KEYS.join(", ")}.`);
  }
  for (const [key, value] of Object.entries(sections)) {
    if (typeof value !== "boolean") {
      throw ApiError.badRequest(`visibleSections.${key} must be true or false.`);
    }
  }
}

const PLATFORM_IDENTITY_FIELDS = ["platformName", "logoUrl", "tagline", "supportEmail", "supportPhone"];
const URL_FIELDS = ["logoUrl"];
const EMAIL_FIELDS = ["supportEmail"];

function validatePlatformIdentityField(key, value) {
  if (value === null) {
    if (key === "platformName") {
      throw ApiError.badRequest("platformName cannot be cleared — it must always be a real, non-empty string.");
    }
    return; // clearing any other optional identity field is fine
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.badRequest(`${key} must be a non-empty string, or null to clear it.`);
  }
  if (value.length > 300) {
    throw ApiError.badRequest(`${key} is too long (max 300 characters).`);
  }
  if (URL_FIELDS.includes(key) && !/^https?:\/\/\S+$/.test(value)) {
    throw ApiError.badRequest(`${key} must be a valid http(s) URL.`);
  }
  if (EMAIL_FIELDS.includes(key) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw ApiError.badRequest(`${key} must be a valid email address.`);
  }
}

function validateRewardTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw ApiError.badRequest("rewardTiers must be a non-empty array.");
  }
  const milestones = new Set();
  for (const tier of tiers) {
    if (
      !tier ||
      typeof tier.milestone !== "number" ||
      !Number.isInteger(tier.milestone) ||
      tier.milestone <= 0
    ) {
      throw ApiError.badRequest("Each reward tier needs a positive whole-number milestone.");
    }
    if (typeof tier.amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(tier.amount) || Number(tier.amount) <= 0) {
      throw ApiError.badRequest("Each reward tier's amount must be a positive number (as a string), e.g. \"50\" or \"50.00\".");
    }
    if (milestones.has(tier.milestone)) {
      throw ApiError.badRequest(`Duplicate milestone (${tier.milestone}) in rewardTiers.`);
    }
    milestones.add(tier.milestone);
  }
}

/**
 * Updates only the fields present in `patch`. Validates every field it
 * touches; never silently clamps or coerces an out-of-range value —
 * rejects the whole request instead, so the admin sees exactly what was
 * wrong rather than a value quietly changing to something they didn't
 * ask for.
 */
async function updateSettings(patch, adminId) {
  const data = { updatedByAdminId: adminId };

  if (patch.cashbackRatePercent !== undefined) {
    const v = Number(patch.cashbackRatePercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw ApiError.badRequest("cashbackRatePercent must be a number between 0 and 100.");
    }
    data.cashbackRatePercent = String(v);
  }

  if (patch.commissionRatePercent !== undefined) {
    const v = Number(patch.commissionRatePercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw ApiError.badRequest("commissionRatePercent must be a number between 0 and 100.");
    }
    data.commissionRatePercent = String(v);
  }

  if (patch.verificationThreshold !== undefined) {
    const v = Number(patch.verificationThreshold);
    if (!Number.isInteger(v) || v <= 0) {
      throw ApiError.badRequest("verificationThreshold must be a positive whole number.");
    }
    data.verificationThreshold = v;
  }

  if (patch.withdrawalFeeRatePercent !== undefined) {
    const v = Number(patch.withdrawalFeeRatePercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw ApiError.badRequest("withdrawalFeeRatePercent must be a number between 0 and 100.");
    }
    data.withdrawalFeeRatePercent = String(v);
  }

  if (patch.rewardTiers !== undefined) {
    validateRewardTiers(patch.rewardTiers);
    data.rewardTiers = patch.rewardTiers;
  }

  if (patch.featuresEnabled !== undefined) {
    validateFeaturesEnabled(patch.featuresEnabled);
    // Merge onto the CURRENT full set rather than replacing it, so a
    // request that only toggles one feature (e.g. { withdrawals: false })
    // can never silently reset the others to their defaults.
    const current = await getSettings();
    data.featuresEnabled = { ...current.featuresEnabled, ...patch.featuresEnabled };
  }

  if (patch.visibleSections !== undefined) {
    validateVisibleSections(patch.visibleSections);
    const current = await getSettings();
    data.visibleSections = { ...current.visibleSections, ...patch.visibleSections };
  }

  for (const field of PLATFORM_IDENTITY_FIELDS) {
    if (patch[field] !== undefined) {
      validatePlatformIdentityField(field, patch[field]);
      data[field] = patch[field];
    }
  }

  // Ensure the row exists before updating (first-ever call safety).
  await getSettings();

  return prisma.platformSettings.update({ where: { id: SETTINGS_ID }, data });
}

/**
 * Convenience for consuming services: `if (!(await isFeatureEnabled("withdrawals", userId))) throw ...`
 * Unknown keys are treated as enabled (fail open) rather than silently
 * blocking behavior for a typo'd key — FEATURE_KEYS is the source of
 * truth for what's a real, spellable key at all.
 *
 * `userId` is optional — omitting it (as every pre-existing call site
 * does) checks only the global platform-wide setting, unchanged from
 * before this override capability existed. When given, a per-user
 * override (see User.featureOverrides) takes priority over the global
 * value in EITHER direction — it can force a feature on for one
 * customer even while it's globally off, or off for one customer while
 * it's globally on.
 */
async function isFeatureEnabled(key, userId = null) {
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { featureOverrides: true } });
    const override = user && user.featureOverrides ? user.featureOverrides[key] : undefined;
    if (typeof override === "boolean") {
      return override;
    }
  }
  const settings = await getSettings();
  const value = settings.featuresEnabled ? settings.featuresEnabled[key] : undefined;
  return value !== false;
}

function validateUserFeatureOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw ApiError.badRequest("featureOverrides must be an object of feature-name -> boolean (or null to clear).");
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!FEATURE_KEYS.includes(key)) {
      throw ApiError.badRequest(`Unknown feature key: ${key}. Known keys: ${FEATURE_KEYS.join(", ")}.`);
    }
    if (value !== null && typeof value !== "boolean") {
      throw ApiError.badRequest(`featureOverrides.${key} must be true, false, or null (to clear the override).`);
    }
  }
}

/**
 * Sets/clears per-user feature overrides. A `null` value for a key
 * clears that key's override (reverting to the global setting) rather
 * than being stored as "force off" — this is the difference between
 * `false` (explicit override) and `null`/absent (inherit).
 */
async function updateUserFeatureOverrides(userId, patch) {
  validateUserFeatureOverrides(patch);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { featureOverrides: true } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }
  const current = user.featureOverrides || {};
  const merged = { ...current, ...patch };
  // Drop any key explicitly cleared to null, rather than storing null
  // values forever.
  for (const [key, value] of Object.entries(merged)) {
    if (value === null) delete merged[key];
  }
  return prisma.user.update({
    where: { id: userId },
    data: { featureOverrides: Object.keys(merged).length > 0 ? merged : null },
    select: { id: true, featureOverrides: true },
  });
}

/**
 * Financial Dashboard Control (Part 4) equivalent of isFeatureEnabled —
 * display-only, same override semantics. A false value here never
 * blocks a real balance/transaction/withdrawal; it only tells the
 * frontend whether to render that section.
 */
async function isSectionVisible(key, userId = null) {
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { sectionOverrides: true } });
    const override = user && user.sectionOverrides ? user.sectionOverrides[key] : undefined;
    if (typeof override === "boolean") {
      return override;
    }
  }
  const settings = await getSettings();
  const value = settings.visibleSections ? settings.visibleSections[key] : undefined;
  return value !== false;
}

/**
 * Returns the full, merged (global + per-user override) visibility map
 * for one user — the single call a frontend needs to decide what to
 * render, rather than N separate isSectionVisible calls.
 */
async function getVisibleSectionsForUser(userId) {
  const [settings, user] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({ where: { id: userId }, select: { sectionOverrides: true } }),
  ]);
  const overrides = (user && user.sectionOverrides) || {};
  const result = {};
  for (const key of SECTION_KEYS) {
    const override = overrides[key];
    result[key] = typeof override === "boolean" ? override : settings.visibleSections[key] !== false;
  }
  return result;
}

function validateUserSectionOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw ApiError.badRequest("sectionOverrides must be an object of section-name -> boolean (or null to clear).");
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!SECTION_KEYS.includes(key)) {
      throw ApiError.badRequest(`Unknown section key: ${key}. Known keys: ${SECTION_KEYS.join(", ")}.`);
    }
    if (value !== null && typeof value !== "boolean") {
      throw ApiError.badRequest(`sectionOverrides.${key} must be true, false, or null (to clear the override).`);
    }
  }
}

async function updateUserSectionOverrides(userId, patch) {
  validateUserSectionOverrides(patch);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sectionOverrides: true } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }
  const current = user.sectionOverrides || {};
  const merged = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null) delete merged[key];
  }
  return prisma.user.update({
    where: { id: userId },
    data: { sectionOverrides: Object.keys(merged).length > 0 ? merged : null },
    select: { id: true, sectionOverrides: true },
  });
}

/**
 * Public, no-auth-required platform identity — a logo/name has to be
 * able to load before anyone logs in (the login/signup screens
 * themselves). Deliberately returns ONLY the 5 identity fields, never
 * any of the rate/threshold/feature-flag settings alongside them.
 */
async function getPlatformIdentity() {
  const settings = await getSettings();
  const identity = {};
  for (const field of PLATFORM_IDENTITY_FIELDS) {
    identity[field] = settings[field];
  }
  return identity;
}

module.exports = {
  getSettings,
  updateSettings,
  isFeatureEnabled,
  updateUserFeatureOverrides,
  isSectionVisible,
  getVisibleSectionsForUser,
  updateUserSectionOverrides,
  getPlatformIdentity,
  SETTINGS_ID,
  DEFAULTS,
  FEATURE_KEYS,
  SECTION_KEYS,
  PLATFORM_IDENTITY_FIELDS,
};
