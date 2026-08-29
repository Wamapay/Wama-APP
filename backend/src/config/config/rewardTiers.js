/**
 * Configurable referral milestone reward tiers.
 *
 * Milestone logic must not be hardcoded throughout the application (see
 * platform rule "Reward Configuration") — everything that evaluates
 * milestones reads this single table. To change/add a tier, edit this
 * file only.
 *
 * Each earned milestone is a SEPARATE reward — reaching 20 does not
 * replace or "collapse into" the 10 and 15 rewards already earned that
 * week (see platform rule "Important Milestone Interpretation").
 */
"use strict";

const REWARD_TIERS = Object.freeze([
  Object.freeze({ milestone: 10, amount: "50" }),
  Object.freeze({ milestone: 15, amount: "75" }),
  Object.freeze({ milestone: 20, amount: "100" }),
]);

module.exports = { REWARD_TIERS };
