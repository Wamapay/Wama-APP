"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const shop = require("../services/shop.service");
const adminService = require("../services/admin.service");

const log = (req, action, targetType, targetId) =>
  adminService.logAdminActivity({ adminId: req.user.id, action, targetType, targetId }).catch(() => {});

// --- Public ------------------------------------------------------------------

const config = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Shop config", data: { config: await shop.getPublicConfig() } }));

const categories = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Shop categories", data: { categories: await shop.listCategories() } }));

const products = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Shop products", data: await shop.listProducts(req.query) }));

const product = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Shop product", data: { product: await shop.getProductBySlug(req.params.slug) } }));

const createOrder = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { statusCode: 201, message: "Order placed", data: { order: await shop.placeOrder(req.body) } }));

const trackOrder = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Order found", data: { order: await shop.trackOrder(req.query.orderNumber, req.query.phone) } }));

// --- Admin -------------------------------------------------------------------

const adminSettings = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Shop settings", data: { settings: await shop.getPublicConfig() } }));

const adminUpdateSettings = asyncHandler(async (req, res) => {
  const settings = await shop.updateSettings(req.body);
  await log(req, "Updated shop settings", "ShopSettings", "default");
  return ApiResponse.success(res, { message: "Shop settings saved", data: { settings } });
});

const adminCategories = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Categories", data: { categories: await shop.adminListCategories() } }));

const adminCreateCategory = asyncHandler(async (req, res) => {
  const category = await shop.createCategory(req.body);
  await log(req, `Created shop category ${category.name}`, "ShopCategory", category.id);
  return ApiResponse.success(res, { statusCode: 201, message: "Category created", data: { category } });
});

const adminAddDefaultCategories = asyncHandler(async (req, res) => {
  const added = await shop.addDefaultCategories();
  await log(req, `Added ${added} suggested shop categories`, "ShopCategory", "defaults");
  return ApiResponse.success(res, { message: added ? `${added} categories added` : "All suggested categories are already there", data: { added } });
});

const adminUpdateCategory = asyncHandler(async (req, res) => {
  const category = await shop.updateCategory(req.params.id, req.body);
  await log(req, `Updated shop category ${category.name}`, "ShopCategory", category.id);
  return ApiResponse.success(res, { message: "Category updated", data: { category } });
});

const adminDeleteCategory = asyncHandler(async (req, res) => {
  await shop.deleteCategory(req.params.id);
  await log(req, "Deleted shop category", "ShopCategory", req.params.id);
  return ApiResponse.success(res, { message: "Category deleted", data: null });
});

const adminProducts = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Products", data: await shop.adminListProducts(req.query) }));

const adminCreateProduct = asyncHandler(async (req, res) => {
  const product = await shop.createProduct(req.body);
  await log(req, `Created shop product ${product.name}`, "ShopProduct", product.id);
  return ApiResponse.success(res, { statusCode: 201, message: "Product created", data: { product } });
});

const adminUpdateProduct = asyncHandler(async (req, res) => {
  const product = await shop.updateProduct(req.params.id, req.body);
  await log(req, `Updated shop product ${product.name}`, "ShopProduct", product.id);
  return ApiResponse.success(res, { message: "Product updated", data: { product } });
});

const adminDeleteProduct = asyncHandler(async (req, res) => {
  await shop.deleteProduct(req.params.id);
  await log(req, "Deleted shop product", "ShopProduct", req.params.id);
  return ApiResponse.success(res, { message: "Product deleted", data: null });
});

const adminOrders = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Orders", data: await shop.adminListOrders(req.query) }));

const adminOrder = asyncHandler(async (req, res) =>
  ApiResponse.success(res, { message: "Order", data: { order: await shop.adminGetOrder(req.params.id) } }));

const adminUpdateOrderStatus = asyncHandler(async (req, res) => {
  const order = await shop.updateOrderStatus(req.params.id, req.body.status);
  await log(req, `Set shop order ${order.orderNumber} to ${order.status}`, "ShopOrder", order.id);
  return ApiResponse.success(res, { message: "Order updated", data: { order } });
});

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** GET /shop/share/:slug — HTML with Open Graph tags that sends humans to the SPA. */
const shareProduct = async (req, res) => {
  const { config } = require("../config/env");
  const base = (config.frontendUrl || "").replace(/\/$/, "");
  const slug = req.params.slug; // absent => the shop front itself
  let p = null;
  if (slug) { try { p = await shop.getProductBySlug(slug); } catch (e) { p = null; } }
  const dest = `${base}/#/shop/${p ? "p/" + encodeURIComponent(slug) : ""}`;
  const title = p ? `${p.name} — GH₵${Number(p.price).toFixed(2)} | Wamton Shop` : "Wamton Shop — everyday essentials, delivered";
  const desc = p ? (p.description || `Order ${p.name} from the Wamton Shop. No account needed.`).replace(/\s+/g, " ").slice(0, 200) : "Shop everyday essentials, delivered to you.";
  const image = p && p.image && /^https?:\/\//.test(p.image) ? p.image : "";
  res.status(!slug || p ? 200 : 404).set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "public, max-age=300").send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="description" content="${esc(desc)}">` +
    `<meta property="og:type" content="product"><meta property="og:site_name" content="Wamton Shop">` +
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">` +
    (image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`) +
    `<meta property="og:url" content="${esc(dest)}"><meta http-equiv="refresh" content="0;url=${esc(dest)}"></head>` +
    `<body><p><a href="${esc(dest)}">Open ${esc(p ? p.name : "the Wamton Shop")}</a></p></body></html>`
  );
};

module.exports = {
  shareProduct,
  adminAddDefaultCategories,
  config, categories, products, product, createOrder, trackOrder,
  adminSettings, adminUpdateSettings, adminCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory,
  adminProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminOrders, adminOrder, adminUpdateOrderStatus,
};

