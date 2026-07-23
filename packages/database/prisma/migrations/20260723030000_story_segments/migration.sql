-- CreateTable
CREATE TABLE "story_segments" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "draft" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "story_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_segments_story_id_order_deleted_at_idx" ON "story_segments"("story_id", "order", "deleted_at");

-- AddForeignKey
ALTER TABLE "story_segments" ADD CONSTRAINT "story_segments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "scenes" ADD COLUMN "segment_id" TEXT;

-- CreateIndex
CREATE INDEX "scenes_segment_id_deleted_at_idx" ON "scenes"("segment_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "story_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
