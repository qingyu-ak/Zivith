-- AlterEnum: additive ApprovalState value for appearance-variant review flow
ALTER TYPE "ApprovalState" ADD VALUE IF NOT EXISTS 'review';

-- CreateTable
CREATE TABLE "asset_appearance_variants" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "change_reason" TEXT,
    "description" TEXT,
    "anchor_media_id" TEXT,
    "candidate_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_appearance_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_appearance_variants_asset_id_key_key" ON "asset_appearance_variants"("asset_id", "key");

-- CreateIndex
CREATE INDEX "asset_appearance_variants_asset_id_order_deleted_at_idx" ON "asset_appearance_variants"("asset_id", "order", "deleted_at");

-- AddForeignKey
ALTER TABLE "asset_appearance_variants" ADD CONSTRAINT "asset_appearance_variants_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing character gets a default variant (anchor = reference_images[0])
INSERT INTO "asset_appearance_variants" (
  "id",
  "asset_id",
  "key",
  "title",
  "anchor_media_id",
  "candidate_media_ids",
  "state",
  "order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  a."id",
  'default',
  '默认形象',
  CASE
    WHEN cardinality(a."reference_images") >= 1 THEN a."reference_images"[1]
    ELSE NULL
  END,
  ARRAY[]::TEXT[],
  CASE
    WHEN cardinality(a."reference_images") >= 1 THEN 'approved'::"ApprovalState"
    ELSE 'draft'::"ApprovalState"
  END,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "assets" a
WHERE a."type" = 'character'
  AND a."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "asset_appearance_variants" v
    WHERE v."asset_id" = a."id"
      AND v."key" = 'default'
      AND v."deleted_at" IS NULL
  );
