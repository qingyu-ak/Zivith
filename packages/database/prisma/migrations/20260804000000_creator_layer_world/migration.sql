-- ADR-0011 / ADR-0012 / ADR-0013 — creator layer world models
-- world_events, relationships, project_timelines, timeline_tracks, timeline_items,
-- creator_chat_threads, creator_chat_messages

-- CreateTable
CREATE TABLE "world_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "anchor_story_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "world_time_envelope" JSONB NOT NULL DEFAULT '{}',
    "presentation_order" INTEGER,
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "character_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scene_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "world_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'directed',
    "label" TEXT,
    "description" TEXT,
    "valid_from" JSONB,
    "valid_until" JSONB,
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_timelines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'World Line',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_tracks" (
    "id" TEXT NOT NULL,
    "timeline_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "timeline_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_items" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "presentation_order" INTEGER NOT NULL,
    "start_offset_ms" INTEGER,
    "duration_ms" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "timeline_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_chat_threads" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT,
    "state" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_chat_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "proposal" JSONB DEFAULT '{}',
    "proposal_key" TEXT,
    "proposal_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_timelines_project_id_key" ON "project_timelines"("project_id");

-- CreateIndex
CREATE INDEX "world_events_project_id_deleted_at_idx" ON "world_events"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "world_events_project_id_anchor_story_id_presentation_order_idx" ON "world_events"("project_id", "anchor_story_id", "presentation_order");

-- CreateIndex
CREATE INDEX "relationships_project_id_deleted_at_idx" ON "relationships"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "relationships_project_id_source_type_source_id_idx" ON "relationships"("project_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "relationships_project_id_target_type_target_id_idx" ON "relationships"("project_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "project_timelines_project_id_deleted_at_idx" ON "project_timelines"("project_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_tracks_timeline_id_order_key" ON "timeline_tracks"("timeline_id", "order");

-- CreateIndex
CREATE INDEX "timeline_tracks_timeline_id_deleted_at_idx" ON "timeline_tracks"("timeline_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_items_track_id_presentation_order_key" ON "timeline_items"("track_id", "presentation_order");

-- CreateIndex
CREATE INDEX "timeline_items_track_id_entity_type_entity_id_idx" ON "timeline_items"("track_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "creator_chat_threads_project_id_idx" ON "creator_chat_threads"("project_id");

-- CreateIndex
CREATE INDEX "creator_chat_messages_thread_id_created_at_idx" ON "creator_chat_messages"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_timelines" ADD CONSTRAINT "project_timelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_tracks" ADD CONSTRAINT "timeline_tracks_timeline_id_fkey" FOREIGN KEY ("timeline_id") REFERENCES "project_timelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "timeline_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_chat_threads" ADD CONSTRAINT "creator_chat_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_chat_messages" ADD CONSTRAINT "creator_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "creator_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
