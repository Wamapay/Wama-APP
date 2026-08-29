/**
 * Password hashing utility (bcrypt).
 *
 * Centralized so the hashing cost/algorithm can be changed in one place.
 * Never store or log plain-text passwords.
 */
"use strict";

const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
