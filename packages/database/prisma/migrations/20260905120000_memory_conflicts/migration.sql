-- Track M2 — 冲突清单（D4）：矛盾不自动写入，落库等用户确认。
CREATE TABLE "memory_conflicts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "source_message_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "fact_type" TEXT NOT NULL,
    "incoming_content" TEXT NOT NULL,
    "existing_content" TEXT NOT NULL,
    "existing_atom_id" TEXT,
    "antonym" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dedup_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decision" TEXT,
    "resolved_atom_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "memory_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_conflicts_project_id_status_idx" ON "memory_conflicts"("project_id", "status");
CREATE INDEX "memory_conflicts_thread_id_status_idx" ON "memory_conflicts"("thread_id", "status");
