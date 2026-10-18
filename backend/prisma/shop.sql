-- Wamton Shop: run once on the production database (idempotent).
-- Alternative: `npx prisma db push` from the backend folder does the same.
DO $$ BEGIN CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING','CONFIRMED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shop_categories" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "comingSoon" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_categories_slug_key" ON "shop_categories"("slug");

CREATE TABLE IF NOT EXISTS "shop_products" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "compareAtPrice" DECIMAL(12,2),
  "origin" TEXT,
  "unitLabel" TEXT,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "trackStock" BOOLEAN NOT NULL DEFAULT true,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_products_slug_key" ON "shop_products"("slug");
CREATE INDEX IF NOT EXISTS "shop_products_categoryId_idx" ON "shop_products"("categoryId");
CREATE INDEX IF NOT EXISTS "shop_products_active_idx" ON "shop_products"("active");
DO $$ BEGIN
  ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shop_orders" (
  "id" TEXT PRIMARY KEY,
  "orderNumber" TEXT NOT NULL,
  "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING',
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerEmail" TEXT,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "region" TEXT,
  "notes" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "deliveryFee" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "stockRestored" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_orders_orderNumber_key" ON "shop_orders"("orderNumber");
CREATE INDEX IF NOT EXISTS "shop_orders_status_idx" ON "shop_orders"("status");
CREATE INDEX IF NOT EXISTS "shop_orders_createdAt_idx" ON "shop_orders"("createdAt");

CREATE TABLE IF NOT EXISTS "shop_order_items" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_order_items_orderId_idx" ON "shop_order_items"("orderId");
DO $$ BEGIN
  ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shop_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "freeDeliveryAbove" DECIMAL(12,2),
  "whatsappNumber" TEXT NOT NULL DEFAULT '',
  "phone1" TEXT NOT NULL DEFAULT '',
  "phone2" TEXT NOT NULL DEFAULT '',
  "announcement" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Multiple product photos, category-specific fields and their values.
ALTER TABLE "shop_categories" ADD COLUMN IF NOT EXISTS "fields" JSONB;
ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "attributes" JSONB;
UPDATE "shop_products" SET "images" = ARRAY["image"] WHERE "image" IS NOT NULL AND cardinality("images") = 0;
