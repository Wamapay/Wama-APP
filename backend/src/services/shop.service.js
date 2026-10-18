/**
 * Wamton Shop — physical goods storefront.
 *
 * Guests browse and place orders with no account and no online payment:
 * the order is stored for the admin to confirm, collect payment for and
 * deliver. Everything money-related (line totals, delivery fee, total)
 * is computed HERE from database prices — the browser only ever sends
 * product ids and quantities.
 */
"use strict";

const crypto = require("crypto");
const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const { toDecimal, add, subtract, toNumber } = require("../utils/money");

const LOW_STOCK_AT = 5;
const STATUS_FLOW = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

// --- helpers -----------------------------------------------------------------

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

async function uniqueSlug(model, base) {
  let slug = slugify(base);
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma[model].findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
/** Phones are compared on their last 9 digits so 024…, +23324… and 24… all match. */
const phoneTail = (s) => digitsOnly(s).slice(-9);

function stockState(p) {
  if (!p.trackStock) return "IN_STOCK";
  if (p.stock <= 0) return "OUT_OF_STOCK";
  if (p.stock <= LOW_STOCK_AT) return "LOW_STOCK";
  return "IN_STOCK";
}

function galleryOf(p) {
  if (Array.isArray(p.images) && p.images.length) return p.images;
  return p.image ? [p.image] : [];
}

/** Readable "label: value" pairs for the product page, in the category's field order. */
function specsOf(p) {
  const attrs = p.attributes && typeof p.attributes === "object" ? p.attributes : {};
  const fields = p.category && Array.isArray(p.category.fields) ? p.category.fields : [];
  const out = [];
  for (const fd of fields) {
    const v = attrs[fd.key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    out.push({ label: fd.label, value: String(v) + (fd.unit && fd.type !== "select" ? " " + fd.unit : "") });
  }
  return out;
}

function toPublicProduct(p) {
  if (!p) return null;
  const price = toNumber(p.price);
  const compareAt = p.compareAtPrice === null || p.compareAtPrice === undefined ? null : toNumber(p.compareAtPrice);
  const onSale = compareAt !== null && compareAt > price;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description || "",
    image: galleryOf(p)[0] || null,
    images: galleryOf(p),
    specs: specsOf(p),
    price,
    compareAtPrice: onSale ? compareAt : null,
    discountPercent: onSale ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
    origin: p.origin || null,
    unitLabel: p.unitLabel || null,
    featured: !!p.featured,
    inStock: stockState(p) !== "OUT_OF_STOCK",
    stockState: stockState(p),
    // Exposed so the cart can cap quantity; null = untracked/unlimited.
    stock: p.trackStock ? p.stock : null,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
  };
}

function toAdminProduct(p) {
  return {
    ...toPublicProduct(p),
    price: toNumber(p.price),
    compareAtPrice: p.compareAtPrice === null || p.compareAtPrice === undefined ? null : toNumber(p.compareAtPrice),
    stock: p.stock,
    trackStock: p.trackStock,
    active: p.active,
    categoryId: p.categoryId || null,
    attributes: p.attributes && typeof p.attributes === "object" ? p.attributes : {},
    createdAt: p.createdAt,
  };
}

function toPublicOrder(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail || null,
    address: o.address,
    city: o.city,
    region: o.region || null,
    notes: o.notes || null,
    currency: o.currency,
    subtotal: toNumber(o.subtotal),
    deliveryFee: toNumber(o.deliveryFee),
    total: toNumber(o.total),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: (o.items || []).map((i) => ({
      id: i.id, productId: i.productId, name: i.name,
      unitPrice: toNumber(i.unitPrice), quantity: i.quantity, lineTotal: toNumber(i.lineTotal),
    })),
  };
}

function newOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = crypto.randomBytes(4).toString("hex").slice(0, 5).toUpperCase();
  return `WS-${ymd}-${rand}`;
}

// --- settings ----------------------------------------------------------------

const DEFAULT_SETTINGS = {
  id: "default", enabled: true, deliveryFee: 0, freeDeliveryAbove: null,
  whatsappNumber: "", phone1: "", phone2: "", announcement: "",
};

async function getSettingsRow() {
  const row = await prisma.shopSettings.findUnique({ where: { id: "default" } });
  return row || DEFAULT_SETTINGS;
}

function toSettings(row) {
  return {
    enabled: !!row.enabled,
    deliveryFee: toNumber(row.deliveryFee),
    freeDeliveryAbove: row.freeDeliveryAbove === null || row.freeDeliveryAbove === undefined ? null : toNumber(row.freeDeliveryAbove),
    whatsappNumber: row.whatsappNumber || "",
    phone1: row.phone1 || "",
    phone2: row.phone2 || "",
    announcement: row.announcement || "",
    currency: "GHS",
  };
}

async function getPublicConfig() {
  return toSettings(await getSettingsRow());
}

async function updateSettings(patch) {
  const data = {};
  for (const k of ["enabled", "whatsappNumber", "phone1", "phone2", "announcement"]) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.deliveryFee !== undefined) data.deliveryFee = toDecimal(patch.deliveryFee).toDecimalPlaces(2).toString();
  if (patch.freeDeliveryAbove !== undefined) {
    data.freeDeliveryAbove = patch.freeDeliveryAbove === null ? null : toDecimal(patch.freeDeliveryAbove).toDecimalPlaces(2).toString();
  }
  const row = await prisma.shopSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  return toSettings(row);
}

/** delivery = flat fee, or 0 once the subtotal reaches the free-delivery threshold. */
function computeDeliveryFee(settings, subtotal) {
  const fee = toDecimal(settings.deliveryFee);
  if (settings.freeDeliveryAbove !== null && settings.freeDeliveryAbove !== undefined) {
    if (toDecimal(subtotal).gte(toDecimal(settings.freeDeliveryAbove))) return toDecimal(0);
  }
  return fee;
}

// --- public catalog ------------------------------------------------------------

async function listCategories() {
  const cats = await prisma.shopCategory.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { active: true } } } } },
  });
  return cats.map((c) => ({
    id: c.id, name: c.name, slug: c.slug, description: c.description || "", image: c.image || null,
    comingSoon: !!c.comingSoon, productCount: c._count ? c._count.products : 0,
    fields: Array.isArray(c.fields) ? c.fields : [],
  }));
}

function productOrderBy(sort) {
  if (sort === "price_asc") return { price: "asc" };
  if (sort === "price_desc") return { price: "desc" };
  if (sort === "name") return { name: "asc" };
  return { createdAt: "desc" };
}

async function listProducts(query = {}) {
  const page = query.page || 1;
  const take = Math.min(query.limit || 24, 60);
  const where = { active: true };
  if (query.q) where.name = { contains: query.q, mode: "insensitive" };
  if (query.category) where.category = { slug: query.category, active: true };
  if (query.featured) where.featured = true;
  const [items, total] = await Promise.all([
    prisma.shopProduct.findMany({ where, include: { category: true }, orderBy: productOrderBy(query.sort), take: query.sale ? 200 : take, skip: query.sale ? 0 : (page - 1) * take }),
    prisma.shopProduct.count({ where }),
  ]);
  let products = items.map(toPublicProduct);
  // "On sale" depends on comparing two columns, which Prisma can't filter on
  // directly, so it is filtered here (the sale list is small by nature).
  if (query.sale) {
    products = products.filter((p) => p.discountPercent > 0).slice((page - 1) * take, page * take);
    return { products, total: products.length, page, pageSize: take };
  }
  return { products, total, page, pageSize: take };
}

async function getProductBySlug(slug) {
  const p = await prisma.shopProduct.findUnique({ where: { slug }, include: { category: true } });
  if (!p || !p.active) throw ApiError.notFound("Product not found.");
  return toPublicProduct(p);
}

// --- ordering ------------------------------------------------------------------

async function placeOrder(input) {
  const settingsRow = await getSettingsRow();
  if (!settingsRow.enabled) throw ApiError.forbidden("The shop is not taking orders right now. Please check back soon.");

  // Merge duplicate lines so the same product can't dodge the stock check.
  const wanted = new Map();
  for (const line of input.items) wanted.set(line.productId, (wanted.get(line.productId) || 0) + line.quantity);
  const ids = [...wanted.keys()];
  if ([...wanted.values()].some((q) => q > 50)) throw ApiError.badRequest("Maximum 50 of one item per order.");

  const products = await prisma.shopProduct.findMany({ where: { id: { in: ids }, active: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const id of ids) {
    if (!byId.has(id)) throw ApiError.badRequest("An item in your cart is no longer available. Please refresh your cart.");
  }
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (p.trackStock && p.stock < qty) {
      throw ApiError.conflict(p.stock <= 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} left in stock.`);
    }
  }

  let subtotal = toDecimal(0);
  const lines = ids.map((id) => {
    const p = byId.get(id);
    const quantity = wanted.get(id);
    const unitPrice = toDecimal(p.price).toDecimalPlaces(2);
    const lineTotal = unitPrice.times(quantity).toDecimalPlaces(2);
    subtotal = add(subtotal, lineTotal);
    return { productId: p.id, name: p.name, unitPrice: unitPrice.toString(), quantity, lineTotal: lineTotal.toString(), _track: p.trackStock };
  });
  const deliveryFee = computeDeliveryFee(toSettings(settingsRow), subtotal);
  const total = add(subtotal, deliveryFee);

  const order = await prisma.$transaction(async (tx) => {
    // Atomic guard: only decrement when enough stock is still there, so two
    // simultaneous orders can't both take the last item.
    for (const l of lines) {
      if (!l._track) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await tx.shopProduct.updateMany({ where: { id: l.productId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (r.count !== 1) throw ApiError.conflict(`${l.name} just sold out. Please update your cart.`);
    }
    let created = null;
    for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        created = await tx.shopOrder.create({
          data: {
            orderNumber: newOrderNumber(),
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerEmail: input.customerEmail || null,
            address: input.address,
            city: input.city,
            region: input.region || null,
            notes: input.notes || null,
            currency: "GHS",
            subtotal: subtotal.toString(),
            deliveryFee: deliveryFee.toString(),
            total: total.toString(),
            items: { create: lines.map(({ _track, ...rest }) => rest) },
          },
          include: { items: true },
        });
      } catch (err) {
        if (!(err && err.code === "P2002")) throw err; // only retry order-number collisions
      }
    }
    if (!created) throw ApiError.conflict("Couldn't create your order. Please try again.");
    return created;
  });

  return toPublicOrder(order);
}

/** Guests look an order up with its number AND the phone it was placed with. */
async function trackOrder(orderNumber, phone) {
  const order = await prisma.shopOrder.findUnique({ where: { orderNumber: String(orderNumber).trim().toUpperCase() }, include: { items: true } });
  if (!order || phoneTail(order.customerPhone) !== phoneTail(phone)) {
    throw ApiError.notFound("We couldn't find an order with that number and phone.");
  }
  return toPublicOrder(order);
}

// --- admin ---------------------------------------------------------------------

async function adminListCategories() {
  const cats = await prisma.shopCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return cats.map((c) => ({ ...c, productCount: c._count ? c._count.products : 0, _count: undefined }));
}

async function createCategory(data) {
  const slug = await uniqueSlug("shopCategory", data.name);
  return prisma.shopCategory.create({ data: { ...data, image: data.image || null, slug } });
}

async function updateCategory(id, data) {
  const existing = await prisma.shopCategory.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Category not found.");
  const patch = { ...data };
  if (patch.image === "") patch.image = null;
  return prisma.shopCategory.update({ where: { id }, data: patch });
}

/** Add the built-in categories that don't exist yet (matched by name). Returns how many were added. */
async function addDefaultCategories() {
  const { DEFAULT_SHOP_CATEGORIES } = require("../config/shopDefaults");
  const existing = await prisma.shopCategory.findMany({ select: { name: true, position: true } });
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  let position = existing.reduce((m, c) => Math.max(m, c.position || 0), -1) + 1;
  let added = 0;
  for (const def of DEFAULT_SHOP_CATEGORIES) {
    if (have.has(def.name.toLowerCase())) continue;
    // eslint-disable-next-line no-await-in-loop
    const slug = await uniqueSlug("shopCategory", def.name);
    // eslint-disable-next-line no-await-in-loop
    await prisma.shopCategory.create({ data: { name: def.name, slug, description: def.description, fields: def.fields, position: position++ } });
    added += 1;
  }
  return added;
}

/** First run only: fill an empty shop with the built-in categories. */
async function seedDefaultCategoriesIfEmpty() {
  if ((await prisma.shopCategory.count()) > 0) return 0;
  return addDefaultCategories();
}

async function deleteCategory(id) {
  const existing = await prisma.shopCategory.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!existing) throw ApiError.notFound("Category not found.");
  if (existing._count && existing._count.products > 0) throw ApiError.conflict("Move or delete this category's products first, or just hide the category.");
  await prisma.shopCategory.delete({ where: { id } });
}

async function adminListProducts({ q, page = 1, limit = 30 } = {}) {
  const where = q ? { name: { contains: q, mode: "insensitive" } } : {};
  const [items, total] = await Promise.all([
    prisma.shopProduct.findMany({ where, include: { category: true }, orderBy: { createdAt: "desc" }, take: limit, skip: (page - 1) * limit }),
    prisma.shopProduct.count({ where }),
  ]);
  return { products: items.map(toAdminProduct), total, page, pageSize: limit };
}

/** Keep only the category's own fields, coerce numbers, enforce required/select rules. */
function cleanAttributes(fields, attrs) {
  const clean = {};
  const missing = [];
  for (const fd of fields) {
    let v = attrs ? attrs[fd.key] : undefined;
    if (typeof v === "string") v = v.trim();
    const empty = v === undefined || v === null || v === "";
    if (empty) { if (fd.required) missing.push(fd.label); continue; }
    if (fd.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw ApiError.badRequest(`${fd.label} must be a number.`);
      v = n;
    } else if (fd.type === "select" && Array.isArray(fd.options) && fd.options.length && !fd.options.includes(String(v))) {
      throw ApiError.badRequest(`${fd.label}: choose one of the listed options.`);
    } else {
      v = String(v);
    }
    clean[fd.key] = v;
  }
  if (missing.length) throw ApiError.badRequest(`Please fill in: ${missing.join(", ")}.`);
  return clean;
}

async function applyCategoryRules(out, existing) {
  const categoryId = out.categoryId !== undefined ? out.categoryId : existing && existing.categoryId;
  const categoryChanged = out.categoryId !== undefined && (!existing || out.categoryId !== existing.categoryId);
  if (out.attributes === undefined && !categoryChanged && existing) return; // nothing to re-check
  if (!categoryId) { if (out.attributes !== undefined) out.attributes = {}; return; }
  const cat = await prisma.shopCategory.findUnique({ where: { id: categoryId } });
  if (!cat) throw ApiError.badRequest("That category no longer exists.");
  const fields = Array.isArray(cat.fields) ? cat.fields : [];
  const source = out.attributes !== undefined ? out.attributes : categoryChanged ? {} : (existing && existing.attributes) || {};
  out.attributes = cleanAttributes(fields, source);
}

function productData(data) {
  const out = { ...data };
  if (out.images !== undefined) {
    out.images = [...new Set(out.images)].slice(0, 8);
    out.image = out.images[0] || null;
  } else if (out.image !== undefined) {
    out.images = out.image ? [out.image] : [];
  }
  if (out.image === "") out.image = null;
  if (out.price !== undefined) out.price = toDecimal(out.price).toDecimalPlaces(2).toString();
  if (out.compareAtPrice !== undefined) out.compareAtPrice = out.compareAtPrice === null ? null : toDecimal(out.compareAtPrice).toDecimalPlaces(2).toString();
  return out;
}

async function createProduct(data) {
  const slug = await uniqueSlug("shopProduct", data.name);
  const payload = productData(data);
  await applyCategoryRules(payload, null);
  const created = await prisma.shopProduct.create({ data: { ...payload, slug }, include: { category: true } });
  return toAdminProduct(created);
}

async function updateProduct(id, data) {
  const existing = await prisma.shopProduct.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Product not found.");
  const payload = productData(data);
  await applyCategoryRules(payload, existing);
  const updated = await prisma.shopProduct.update({ where: { id }, data: payload, include: { category: true } });
  return toAdminProduct(updated);
}

async function deleteProduct(id) {
  const existing = await prisma.shopProduct.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Product not found.");
  // Past orders keep their own name/price snapshot, so deleting is safe.
  await prisma.shopProduct.delete({ where: { id } });
}

async function adminListOrders({ status, q, page = 1, limit = 30 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q.toUpperCase() } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q } },
    ];
  }
  const [items, total, pending] = await Promise.all([
    prisma.shopOrder.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, take: limit, skip: (page - 1) * limit }),
    prisma.shopOrder.count({ where }),
    prisma.shopOrder.count({ where: { status: "PENDING" } }),
  ]);
  return { orders: items.map(toPublicOrder), total, pendingCount: pending, page, pageSize: limit };
}

async function adminGetOrder(id) {
  const order = await prisma.shopOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw ApiError.notFound("Order not found.");
  return toPublicOrder(order);
}

async function updateOrderStatus(id, status) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw ApiError.notFound("Order not found.");
    if (order.status === status) return toPublicOrder(order);
    if (!(STATUS_FLOW[order.status] || []).includes(status)) {
      throw ApiError.badRequest(`An order that is ${order.status.replace(/_/g, " ").toLowerCase()} can't be changed to ${status.replace(/_/g, " ").toLowerCase()}.`);
    }
    const data = { status };
    if (status === "CANCELLED" && !order.stockRestored) {
      // Put the stock back exactly once.
      for (const item of order.items) {
        if (!item.productId) continue;
        // eslint-disable-next-line no-await-in-loop
        await tx.shopProduct.updateMany({ where: { id: item.productId, trackStock: true }, data: { stock: { increment: item.quantity } } });
      }
      data.stockRestored = true;
    }
    const updated = await tx.shopOrder.update({ where: { id }, data, include: { items: true } });
    return toPublicOrder(updated);
  });
}

module.exports = {
  slugify, phoneTail, computeDeliveryFee, stockState, STATUS_FLOW,
  getPublicConfig, updateSettings, listCategories, listProducts, getProductBySlug, placeOrder, trackOrder,
  adminListCategories, createCategory, updateCategory, deleteCategory, addDefaultCategories, seedDefaultCategoriesIfEmpty,
  adminListProducts, createProduct, updateProduct, deleteProduct,
  adminListOrders, adminGetOrder, updateOrderStatus,
};
