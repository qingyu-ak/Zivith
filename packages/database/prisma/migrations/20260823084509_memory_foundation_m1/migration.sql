-- CreateTable
CREATE TABLE "memory_atoms" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "source_message_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "fact_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "dedup_hash" TEXT NOT NULL,
    "memory_op" TEXT NOT NULL DEFAULT 'ADD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "superseded_by_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_atoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_cores" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source_atom_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_cores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_pipeline_states" (
    "message_id" TEXT NOT NULL,
    "level_1_at" TIMESTAMP(3),
    "extraction_mode" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_pipeline_states_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "thread_context_states" (
    "thread_id" TEXT NOT NULL,
    "rolling_summary" TEXT NOT NULL DEFAULT '',
    "summarized_until_message_id" TEXT,
    "summary_version" INTEGER NOT NULL DEFAULT 1,
    "token_estimate" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thread_context_states_pkey" PRIMARY KEY ("thread_id")
);

-- CreateIndex
CREATE INDEX "memory_atoms_project_id_entity_type_entity_id_idx" ON "memory_atoms"("project_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "memory_atoms_project_id_status_valid_to_idx" ON "memory_atoms"("project_id", "status", "valid_to");

-- CreateIndex
CREATE INDEX "memory_atoms_dedup_hash_idx" ON "memory_atoms"("dedup_hash");

-- CreateIndex
CREATE INDEX "memory_cores_project_id_kind_topic_idx" ON "memory_cores"("project_id", "kind", "topic");
