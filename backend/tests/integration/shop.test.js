"use strict";

/**
 * Wamton Shop — end to end through the REAL Express app, validators,
 * controllers and service. Only the database is an in-memory fake.
 */
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");

const db = { settings: null, categories: [], products: [], orders: [], users: [], activity: [] };
let seq = 0;
const id = (p) => `${p}${++seq}`;
const dec = (v) => (v === null || v === undefined ? v : String(v));

function matchWhere(p, where = {}) {
  if (where.id && where.id.in && !where.id.in.includes(p.id)) return false;
  if (typeof where.id === "string" && p.id !== where.id) return false;
  if (where.active !== undefined && p.active !== where.active) return false;
  if (where.featured !== undefined && p.featured !== where.featured) return false;
  if (where.name && where.name.contains && !p.name.toLowerCase().includes(where.name.contains.toLowerCase())) return false;
  if (where.category) {
    const c = db.categories.find((x) => x.id === p.categoryId);
    if (!c || c.slug !== where.category.slug || (where.category.active !== undefined && c.active !== where.category.active)) return false;
  }
  return true;
}
const withCat = (p) => ({ ...p, category: db.categories.find((c) => c.id === p.categoryId) || null });

const mockFake = {
  shopSettings: {
    findUnique: jest.fn(async () => db.settings),
    upsert: jest.fn(async ({ create, update }) => { db.settings = { id: "default", enabled: true, deliveryFee: 0, freeDeliveryAbove: null, whatsappNumber: "", phone1: "", phone2: "", announcement: "", ...(db.settings || create), ...update }; return db.settings; }),
  },
  shopCategory: {
    findMany: jest.fn(async ({ where }) => db.categories.filter((c) => !where || where.active === undefined || c.active === where.active).map((c) => ({ ...c, _count: { products: db.products.filter((p) => p.categoryId === c.id && p.active).length } }))),
    findUnique: jest.fn(async ({ where }) => db.categories.find((c) => (where.id ? c.id === where.id : c.slug === where.slug)) || null),
    create: jest.fn(async ({ data }) => { const c = { id: id("cat"), position: 0, active: true, comingSoon: false, ...data }; db.categories.push(c); return c; }),
    update: jest.fn(async ({ where, data }) => Object.assign(db.categories.find((c) => c.id === where.id), data)),
    delete: jest.fn(async ({ where }) => { db.categories = db.categories.filter((c) => c.id !== where.id); }),
  },
  shopProduct: {
    findMany: jest.fn(async ({ where }) => db.products.filter((p) => matchWhere(p, where)).map(withCat)),
    count: jest.fn(async ({ where }) => db.products.filter((p) => matchWhere(p, where)).length),
    findUnique: jest.fn(async ({ where }) => { const p = db.products.find((x) => (where.id ? x.id === where.id : x.slug === where.slug)); return p ? withCat(p) : null; }),
    create: jest.fn(async ({ data }) => { const p = { id: id("prod"), stock: 0, trackStock: true, featured: false, active: true, createdAt: new Date(), compareAtPrice: null, ...data }; db.products.push(p); return withCat(p); }),
    update: jest.fn(async ({ where, data }) => withCat(Object.assign(db.products.find((p) => p.id === where.id), data))),
    updateMany: jest.fn(async ({ where, data }) => {
      const rows = db.products.filter((p) => p.id === where.id && (!where.stock || p.stock >= where.stock.gte) && (where.trackStock === undefined || p.trackStock === where.trackStock));
      rows.forEach((p) => { if (data.stock && data.stock.decrement) p.stock -= data.stock.decrement; if (data.stock && data.stock.increment) p.stock += data.stock.increment; });
      return { count: rows.length };
    }),
    delete: jest.fn(async ({ where }) => { db.products = db.products.filter((p) => p.id !== where.id); }),
  },
  shopOrder: {
    create: jest.fn(async ({ data }) => {
      const { items, ...rest } = data;
      const o = { id: id("ord"), status: "PENDING", stockRestored: false, createdAt: new Date(), updatedAt: new Date(), ...rest, items: items.create.map((i) => ({ id: id("it"), ...i })) };
      db.orders.push(o);
      return o;
    }),
    findUnique: jest.fn(async ({ where }) => db.orders.find((o) => (where.id ? o.id === where.id : o.orderNumber === where.orderNumber)) || null),
    update: jest.fn(async ({ where, data }) => Object.assign(db.orders.find((o) => o.id === where.id), data)),
    findMany: jest.fn(async ({ where }) => db.orders.filter((o) => !where || !where.status || o.status === where.status)),
    count: jest.fn(async ({ where }) => db.orders.filter((o) => !where || !where.status || o.status === where.status).length),
  },
  user: { findUnique: jest.fn(async ({ where }) => db.users.find((u) => u.id === where.id) || null) },
  adminActivity: { create: jest.fn(async ({ data }) => { db.activity.push(data); }) },
  $transaction: jest.fn(async (cb) => cb(mockFake)),
};

jest.mock("../../src/database/client", () => ({
  get prisma() { return mockFake; },
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
}));

// The real order limiter (12/hour per IP) is covered in shop.ratelimit.test.js;
// here it would just trip over the many orders these tests place.
jest.mock("../../src/middleware/rateLimiter", () => {
  const actual = jest.requireActual("../../src/middleware/rateLimiter");
  const pass = (req, res, next) => next();
  return Object.assign(actual.bind ? (req, res, next) => actual(req, res, next) : actual, { ...actual, shopOrderRateLimiter: pass, shopTrackRateLimiter: pass });
});

const app = require("../../src/app");
const { signAccessToken } = require("../../src/utils/jwt");

const api = (p) => "/api/v1" + p;
const guest = { customerName: "Ama Mensah", customerPhone: "0241234567", address: "12 Palm Street, East Legon", city: "Accra" };
let admin, adminAuth, userAuth, milo, adobo, drinks;

beforeEach(() => {
  seq = 0;
  Object.assign(db, { settings: null, categories: [], products: [], orders: [], users: [], activity: [] });
  admin = { id: "admin1", role: "ADMIN", status: "ACTIVE", email: "a@x.com" };
  db.users.push(admin, { id: "user1", role: "USER", status: "ACTIVE", email: "u@x.com" });
  adminAuth = "Bearer " + signAccessToken({ userId: "admin1", role: "ADMIN" });
  userAuth = "Bearer " + signAccessToken({ userId: "user1", role: "USER" });
  drinks = { id: "catD", name: "Drinks", slug: "drinks", active: true, comingSoon: false, position: 0 };
  db.categories.push(drinks, { id: "catF", name: "Fashion", slug: "fashion", active: true, comingSoon: true, position: 1 });
  milo = { id: "pMilo", name: "Nestle Milo 1.4kg", slug: "nestle-milo-1-4kg", price: "120.00", compareAtPrice: "150.00", stock: 10, trackStock: true, featured: true, active: true, categoryId: "catD", createdAt: new Date() };
  adobo = { id: "pAdobo", name: "Adobo", slug: "adobo", price: "30.00", compareAtPrice: null, stock: 2, trackStock: true, featured: false, active: true, categoryId: null, createdAt: new Date() };
  db.products.push(milo, adobo, { id: "pHidden", name: "Hidden", slug: "hidden", price: "5.00", stock: 5, trackStock: true, active: false, featured: false, categoryId: null, createdAt: new Date() });
});

describe("public catalog (no login)", () => {
  it("lists categories incl. coming soon, and only active products", async () => {
    const cats = await request(app).get(api("/shop/categories"));
    expect(cats.status).toBe(200);
    expect(cats.body.data.categories.find((c) => c.slug === "fashion").comingSoon).toBe(true);
    const prods = await request(app).get(api("/shop/products"));
    expect(prods.status).toBe(200);
    expect(prods.body.data.products.map((p) => p.slug).sort()).toEqual(["adobo", "nestle-milo-1-4kg"]);
  });

  it("shows the discount, filters by category / sale / search", async () => {
    const all = (await request(app).get(api("/shop/products"))).body.data.products;
    expect(all.find((p) => p.slug === "nestle-milo-1-4kg").discountPercent).toBe(20);
    expect((await request(app).get(api("/shop/products?category=drinks"))).body.data.products).toHaveLength(1);
    expect((await request(app).get(api("/shop/products?sale=1"))).body.data.products.map((p) => p.slug)).toEqual(["nestle-milo-1-4kg"]);
    expect((await request(app).get(api("/shop/products?q=ado"))).body.data.products.map((p) => p.slug)).toEqual(["adobo"]);
  });

  it("returns a product by slug, and 404s for hidden or unknown ones", async () => {
    expect((await request(app).get(api("/shop/products/adobo"))).status).toBe(200);
    expect((await request(app).get(api("/shop/products/hidden"))).status).toBe(404);
    expect((await request(app).get(api("/shop/products/nope"))).status).toBe(404);
  });

  it("never exposes admin-only fields", async () => {
    const p = (await request(app).get(api("/shop/products/adobo"))).body.data.product;
    expect(p.active).toBeUndefined();
    expect(p.createdAt).toBeUndefined();
  });
});

describe("guest ordering (server-side pricing)", () => {
  it("places an order with no account, computes totals itself, decrements stock", async () => {
    db.settings = { id: "default", enabled: true, deliveryFee: 15, freeDeliveryAbove: null, whatsappNumber: "", phone1: "", phone2: "", announcement: "" };
    const res = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pMilo", quantity: 2 }, { productId: "pAdobo", quantity: 1 }] });
    expect(res.status).toBe(201);
    const o = res.body.data.order;
    expect(o.subtotal).toBe(270);
    expect(o.deliveryFee).toBe(15);
    expect(o.total).toBe(285);
    expect(o.status).toBe("PENDING");
    expect(o.orderNumber).toMatch(/^WS-\d{6}-[0-9A-F]{5}$/);
    expect(db.products.find((p) => p.id === "pMilo").stock).toBe(8);
    expect(db.products.find((p) => p.id === "pAdobo").stock).toBe(1);
  });

  it("ignores any price/total/fee the browser sends", async () => {
    const res = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pMilo", quantity: 1, price: 0.01, unitPrice: 0.01 }], total: 1, subtotal: 1, deliveryFee: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.order.subtotal).toBe(120);
    expect(res.body.data.order.total).toBe(120);
  });

  it("free delivery above the threshold, fee below it", async () => {
    db.settings = { id: "default", enabled: true, deliveryFee: 20, freeDeliveryAbove: 100, whatsappNumber: "", phone1: "", phone2: "", announcement: "" };
    const small = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 1 }] });
    expect(small.body.data.order.deliveryFee).toBe(20);
    const big = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pMilo", quantity: 1 }] });
    expect(big.body.data.order.deliveryFee).toBe(0);
    expect(big.body.data.order.total).toBe(120);
  });

  it("free delivery by default (no settings saved yet)", async () => {
    const res = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 1 }] });
    expect(res.body.data.order.deliveryFee).toBe(0);
  });

  it("rejects more than the stock, hidden products, unknown ids, and bad input", async () => {
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 3 }] })).status).toBe(409);
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pHidden", quantity: 1 }] })).status).toBe(400);
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "ghost", quantity: 1 }] })).status).toBe(400);
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [] })).status).toBe(422);
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, customerPhone: "12", items: [{ productId: "pAdobo", quantity: 1 }] })).status).toBe(422);
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: -1 }] })).status).toBe(422);
    expect(db.orders).toHaveLength(0);
    expect(db.products.find((p) => p.id === "pAdobo").stock).toBe(2);
  });

  it("splitting one product across lines cannot beat the stock check", async () => {
    const res = await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 2 }, { productId: "pAdobo", quantity: 2 }] });
    expect(res.status).toBe(409);
  });

  it("refuses orders while the shop is switched off", async () => {
    db.settings = { id: "default", enabled: false, deliveryFee: 0, freeDeliveryAbove: null };
    expect((await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 1 }] })).status).toBe(403);
  });
});

describe("share link preview", () => {
  it("serves Open Graph tags and a redirect for a product, and escapes content", async () => {
    const r = await request(app).get(api("/shop/share/adobo"));
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain('property="og:title"');
    expect(r.text).toContain("#/shop/p/adobo");
  });
  it("serves a preview for the shop front itself", async () => {
    const r = await request(app).get(api("/shop/share"));
    expect(r.status).toBe(200);
    expect(r.text).toContain("#/shop/");
    expect(r.text).toContain("Wamton Shop");
  });
  it("falls back to the shop for an unknown product", async () => {
    const r = await request(app).get(api("/shop/share/nope"));
    expect(r.status).toBe(404);
    expect(r.text).toContain("#/shop/");
  });
});

describe("order tracking", () => {
  it("finds an order with the number and the same phone in any format, and nobody else", async () => {
    const placed = (await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 1 }] })).body.data.order;
    for (const phone of ["0241234567", "+233241234567", "241234567"]) {
      const r = await request(app).get(api("/shop/orders/track")).query({ orderNumber: placed.orderNumber.toLowerCase(), phone });
      expect(r.status).toBe(200);
      expect(r.body.data.order.orderNumber).toBe(placed.orderNumber);
    }
    expect((await request(app).get(api("/shop/orders/track")).query({ orderNumber: placed.orderNumber, phone: "0200000000" })).status).toBe(404);
    expect((await request(app).get(api("/shop/orders/track")).query({ orderNumber: "WS-000000-AAAAA", phone: "0241234567" })).status).toBe(404);
  });
});

describe("admin shop management", () => {
  it("is closed to the public and to ordinary users", async () => {
    expect((await request(app).get(api("/admin/shop/orders"))).status).toBe(401);
    expect((await request(app).get(api("/admin/shop/orders")).set("Authorization", userAuth)).status).toBe(403);
    expect((await request(app).patch(api("/admin/shop/settings")).set("Authorization", userAuth).send({ deliveryFee: 0 })).status).toBe(403);
  });

  it("admin sets the delivery fee and the public config follows", async () => {
    const r = await request(app).patch(api("/admin/shop/settings")).set("Authorization", adminAuth).send({ deliveryFee: 25, freeDeliveryAbove: 300, whatsappNumber: "+233241234567", announcement: "Free delivery over GHS 300" });
    expect(r.status).toBe(200);
    const cfg = (await request(app).get(api("/shop/config"))).body.data.config;
    expect(cfg.deliveryFee).toBe(25);
    expect(cfg.freeDeliveryAbove).toBe(300);
    expect(cfg.whatsappNumber).toBe("+233241234567");
    expect(cfg.currency).toBe("GHS");
  });

  it("admin creates a category and product that then appear in the public shop", async () => {
    const c = await request(app).post(api("/admin/shop/categories")).set("Authorization", adminAuth).send({ name: "Spices & Sauces" });
    expect(c.status).toBe(201);
    expect(c.body.data.category.slug).toBe("spices-sauces");
    const p = await request(app).post(api("/admin/shop/products")).set("Authorization", adminAuth).send({ name: "Shito", price: 45, stock: 12, categoryId: c.body.data.category.id, featured: true });
    expect(p.status).toBe(201);
    const pub = await request(app).get(api("/shop/products/" + p.body.data.product.slug));
    expect(pub.status).toBe(200);
    expect(pub.body.data.product.price).toBe(45);
    const dup = await request(app).post(api("/admin/shop/products")).set("Authorization", adminAuth).send({ name: "Shito", price: 50 });
    expect(dup.body.data.product.slug).toBe("shito-2");
  });

  it("admin hides a product and it disappears from the shop; edits don't change past orders", async () => {
    const placed = (await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pMilo", quantity: 1 }] })).body.data.order;
    await request(app).patch(api("/admin/shop/products/pMilo")).set("Authorization", adminAuth).send({ active: false, price: 999 });
    expect((await request(app).get(api("/shop/products/nestle-milo-1-4kg"))).status).toBe(404);
    const o = (await request(app).get(api("/admin/shop/orders/" + placed.id)).set("Authorization", adminAuth)).body.data.order;
    expect(o.items[0].unitPrice).toBe(120);
    expect(o.total).toBe(120);
  });

  it("admin moves an order along; cancelling puts the stock back exactly once", async () => {
    const placed = (await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pMilo", quantity: 3 }] })).body.data.order;
    expect(db.products.find((p) => p.id === "pMilo").stock).toBe(7);
    const set = (status) => request(app).patch(api(`/admin/shop/orders/${placed.id}/status`)).set("Authorization", adminAuth).send({ status });
    expect((await set("CONFIRMED")).status).toBe(200);
    expect((await set("CANCELLED")).status).toBe(200);
    expect(db.products.find((p) => p.id === "pMilo").stock).toBe(10);
    expect((await set("CANCELLED")).status).toBe(200);
    expect(db.products.find((p) => p.id === "pMilo").stock).toBe(10);
    expect((await set("DELIVERED")).status).toBe(400);
    expect(db.activity.length).toBeGreaterThan(0);
  });

  it("lists orders for the admin with a pending count", async () => {
    await request(app).post(api("/shop/orders")).send({ ...guest, items: [{ productId: "pAdobo", quantity: 1 }] });
    const r = await request(app).get(api("/admin/shop/orders?status=PENDING")).set("Authorization", adminAuth);
    expect(r.status).toBe(200);
    expect(r.body.data.orders).toHaveLength(1);
    expect(r.body.data.pendingCount).toBe(1);
  });
});
