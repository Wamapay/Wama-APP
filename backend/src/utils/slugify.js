/**
 * Minimal, dependency-free slug generation.
 * Used for Course.slug / Category.slug when the client does not supply
 * (or supplies an invalid) custom slug.
 */
"use strict";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

// Custom slugs must be URL-safe: lowercase letters, numbers, and hyphens
// only, no leading/trailing/double hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 180 && SLUG_PATTERN.test(value);
}

module.exports = { slugify, isValidSlug, SLUG_PATTERN };
