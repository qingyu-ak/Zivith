-- CreateEnum
CREATE TYPE "EntityChangeKind" AS ENUM ('baseline', 'create', 'update', 'transition', 'delete', 'restore', 'merge');

-- CreateTable
CREATE TABLE "entity_revisions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "parent_revision_id" TEXT,
    "branch_id" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "snapshot_ref" TEXT,
    "snapshot_hash" TEXT NOT NULL,
    "change_kind" "EntityChangeKind" NOT NULL,
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_revisions_snapshot_xor_ref_check" CHECK (
      (("snapshot" IS NOT NULL AND "snapshot_ref" IS NULL)
        OR ("snapshot" IS NULL AND "snapshot_ref" IS NOT NULL))
    )
);

-- CreateTable
CREATE TABLE "change_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "entity_revision_id" TEXT,
    "actor_type" TEXT,
    "actor_id" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "idempotency_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sequences" (
    "project_id" TEXT NOT NULL,
    "last_value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "project_sequences_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_revisions_entity_type_entity_id_revision_key" ON "entity_revisions"("entity_type", "entity_id", "revision");

-- CreateIndex
CREATE INDEX "entity_revisions_project_id_entity_type_entity_id_idx" ON "entity_revisions"("project_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "entity_revisions_project_id_created_at_idx" ON "entity_revisions"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "change_events_project_id_sequence_key" ON "change_events"("project_id", "sequence");

-- CreateIndex
CREATE INDEX "change_events_project_id_created_at_idx" ON "change_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "change_events_project_id_entity_type_entity_id_idx" ON "change_events"("project_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "change_events_project_id_correlation_id_idx" ON "change_events"("project_id", "correlation_id");

-- Partial unique: idempotency keys only when present
CREATE UNIQUE INDEX "change_events_project_id_idempotency_key_key" ON "change_events"("project_id", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "entity_revisions" ADD CONSTRAINT "entity_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_revisions" ADD CONSTRAINT "entity_revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "entity_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_entity_revision_id_fkey" FOREIGN KEY ("entity_revision_id") REFERENCES "entity_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sequences" ADD CONSTRAINT "project_sequences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
