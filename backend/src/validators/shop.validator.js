"use strict";

const { z } = require("zod");

const money = z.coerce.number().min(0).max(10000000);
const optText = (max) => z.string().trim().max(max).optional();

// --- Public -----------------------------------------------------------------

const productListQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    sale: z.coerce.number().int().min(0).max(1).optional(),
    featured: z.coerce.number().int().min(0).max(1).optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "name"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
  }).passthrough(),
});

const slugParamSchema = z.object({ params: z.object({ slug: z.string().trim().min(1).max(160) }) });

// Phone: at least 7 digits, digits/space/+/-/() only.
const phoneField = z
  .string()
  .trim()
  .max(24)
  .refine((v) => /^[+\d][\d\s\-()]*$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15, "Enter a valid phone number");

const createOrderSchema = z.object({
  body: z.object({
    customerName: z.string().trim().min(2, "Enter your name").max(120),
    customerPhone: phoneField,
    customerEmail: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
    address: z.string().trim().min(5, "Enter your delivery address").max(400),
    city: z.string().trim().min(2, "Enter your city or town").max(120),
    region: optText(120),
    notes: optText(500),
    // Quantities are bounded; prices are NOT accepted from the client at all.
    items: z
      .array(z.object({ productId: z.string().trim().min(1).max(60), quantity: z.coerce.number().int().min(1).max(50) }))
      .min(1, "Your cart is empty")
      .max(40),
  }).strip(),
});

const trackOrderSchema = z.object({
  query: z.object({
    orderNumber: z.string().trim().min(4).max(40),
    phone: phoneField,
  }),
});

// --- Admin ------------------------------------------------------------------

const idParamSchema = z.object({ params: z.object({ id: z.string().trim().min(1).max(60) }) });

const fieldDef = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letters and numbers only for the field key"),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "select"]),
  options: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  required: z.boolean().optional(),
  unit: z.string().trim().max(20).optional(),
}).strip();
const fieldsList = z.array(fieldDef).max(30).refine((l) => new Set(l.map((x) => x.key)).size === l.length, "Each field needs a different key");

const categoryBody = {
  name: z.string().trim().min(2).max(80),
  description: optText(500),
  image: z.string().trim().url().max(1000).optional().or(z.literal("")),
  position: z.coerce.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  comingSoon: z.boolean().optional(),
  fields: fieldsList.optional(),
};
const createCategorySchema = z.object({ body: z.object(categoryBody).strip() });
const updateCategorySchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({ ...categoryBody, name: categoryBody.name.optional() }).strip().refine((d) => Object.keys(d).length > 0, "At least one field is required"),
});

const productBody = {
  name: z.string().trim().min(2).max(160),
  description: optText(5000),
  image: z.string().trim().url().max(1000).optional().or(z.literal("")),
  images: z.array(z.string().trim().url().max(1000)).max(8).optional(),
  attributes: z.record(z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).refine((o) => Object.keys(o).length <= 40, "Too many details").optional(),
  price: money,
  compareAtPrice: money.nullable().optional(),
  origin: optText(60),
  unitLabel: optText(60),
  stock: z.coerce.number().int().min(0).max(1000000).optional(),
  trackStock: z.boolean().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  categoryId: z.string().trim().min(1).max(60).nullable().optional(),
};
const createProductSchema = z.object({ body: z.object(productBody).strip() });
const updateProductSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({ ...productBody, name: productBody.name.optional(), price: productBody.price.optional() }).strip().refine((d) => Object.keys(d).length > 0, "At least one field is required"),
});

const adminProductListQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).passthrough(),
});

const adminOrderListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]).optional(),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).passthrough(),
});

const updateOrderStatusSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({ status: z.enum(["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]) }),
});

const updateSettingsSchema = z.object({
  body: z.object({
    enabled: z.boolean().optional(),
    deliveryFee: money.optional(),
    freeDeliveryAbove: money.nullable().optional(),
    whatsappNumber: z.string().trim().max(24).optional(),
    phone1: z.string().trim().max(24).optional(),
    phone2: z.string().trim().max(24).optional(),
    announcement: z.string().trim().max(200).optional(),
  }).strip().refine((d) => Object.keys(d).length > 0, "At least one field is required"),
});

module.exports = {
  productListQuerySchema, slugParamSchema, createOrderSchema, trackOrderSchema,
  idParamSchema, createCategorySchema, updateCategorySchema, createProductSchema, updateProductSchema,
  adminProductListQuerySchema, adminOrderListQuerySchema, updateOrderStatusSchema, updateSettingsSchema,
};
