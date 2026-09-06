/**
 * Category business logic.
 * Only Admins/Super Admins may create/update/archive categories — never
 * ordinary users. See routes/admin.routes.js.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const { slugify, isValidSlug } = require("../utils/slugify");

async function generateUniqueSlug(base, excludeId = null) {
  const root = isValidSlug(base) ? base : slugify(base);
  if (!root) {
    throw ApiError.badRequest("Could not derive a valid slug from the provided name.");
  }

  let candidate = root;
  let suffix = 2;
  // Bounded retry loop — category volumes are small, this will never
  // realistically exhaust attempts.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const existing = await prisma.category.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  throw ApiError.conflict("Could not generate a unique category slug.");
}

async function listCategories({ status, page = 1, limit = 50, isAdmin = false } = {}) {
  const take = Math.min(Number(limit) || 50, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = {};
  if (status) {
    where.status = status;
  } else if (!isAdmin) {
    where.status = "ACTIVE";
  }

  const [items, total] = await Promise.all([
    prisma.category.findMany({ where, take, skip, orderBy: { name: "asc" } }),
    prisma.category.count({ where }),
  ]);

  return { items, total, page: Math.max(Number(page) || 1, 1), pageSize: take };
}

async function getCategoryBySlug(slug, { isAdmin = false } = {}) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) {
    throw ApiError.notFound("Category not found.");
  }
  if (category.status !== "ACTIVE" && !isAdmin) {
    throw ApiError.notFound("Category not found.");
  }
  return category;
}

async function getCategoryById(id) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    throw ApiError.notFound("Category not found.");
  }
  return category;
}

async function createCategory({ name, slug, description, image }) {
  const existingName = await prisma.category.findUnique({ where: { name } });
  if (existingName) {
    throw ApiError.conflict("A category with this name already exists.");
  }

  const finalSlug = await generateUniqueSlug(slug || name);

  return prisma.category.create({
    data: { name, slug: finalSlug, description, image },
  });
}

async function updateCategory(id, updates) {
  const category = await getCategoryById(id);

  const data = {};
  if (updates.name !== undefined && updates.name !== category.name) {
    const existingName = await prisma.category.findUnique({ where: { name: updates.name } });
    if (existingName && existingName.id !== id) {
      throw ApiError.conflict("A category with this name already exists.");
    }
    data.name = updates.name;
  }
  if (updates.slug !== undefined) {
    data.slug = await generateUniqueSlug(updates.slug, id);
  }
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.image !== undefined) data.image = updates.image;

  return prisma.category.update({ where: { id }, data });
}

async function archiveCategory(id) {
  await getCategoryById(id);
  return prisma.category.update({ where: { id }, data: { status: "ARCHIVED" } });
}

async function activateCategory(id) {
  await getCategoryById(id);
  return prisma.category.update({ where: { id }, data: { status: "ACTIVE" } });
}

module.exports = {
  generateUniqueSlug,
  listCategories,
  getCategoryBySlug,
  getCategoryById,
  createCategory,
  updateCategory,
  archiveCategory,
  activateCategory,
};
