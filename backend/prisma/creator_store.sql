-- Creator Store: run once on the production database (idempotent).
-- Alternative: `npx prisma db push` from the backend folder does the same.
DO $$ BEGIN CREATE TYPE "AccountType" AS ENUM ('NORMAL','CREATOR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED','DRAFT','PENDING','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CREATOR_SALE';
ALTER TYPE "BalanceType" ADD VALUE IF NOT EXISTS 'EARNINGS';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountType" "AccountType" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "earningsBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "creatorId" TEXT;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
DO $$ BEGIN
  ALTER TABLE "courses" ADD CONSTRAINT "courses_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "courses_creatorId_idx" ON "courses"("creatorId");
CREATE INDEX IF NOT EXISTS "courses_approvalStatus_idx" ON "courses"("approvalStatus");
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "creatorFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 20;

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'COURSE';
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
