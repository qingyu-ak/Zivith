-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('draft', 'approved');

-- CreateEnum
CREATE TYPE "ShotState" AS ENUM ('draft', 'prompting', 'generating', 'review', 'approved');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('character', 'location', 'prop', 'style', 'media', 'knowledge', 'prompt_template');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video', 'audio', 'three_d_model', 'document');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('uploaded', 'generated', 'imported');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "OutputStatus" AS ENUM ('queued', 'generating', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('pending', 'generating', 'review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT,
    "synopsis" TEXT,
    "genre" TEXT,
    "theme" TEXT,
    "target_audience" TEXT,
    "tone" TEXT,
    "target_duration_seconds" INTEGER,
    "language" TEXT,
    "screenplay" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "overrides" JSONB,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "state" "ApprovalState" NOT NULL DEFAULT 'draft',
    "location_id" TEXT,
    "time" TEXT,
    "weather" TEXT,
    "mood" TEXT,
    "character_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "overrides" JSONB,
    "approved_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,
    "state" "ShotState" NOT NULL DEFAULT 'draft',
    "narrative_mode" TEXT NOT NULL DEFAULT 'present',
    "location_area" TEXT,
    "camera" JSONB,
    "composition" JSONB,
    "lighting" JSONB,
    "color" JSONB,
    "mood" TEXT,
    "style" JSONB,
    "characters" JSONB NOT NULL DEFAULT '[]',
    "dialogue" JSONB,
    "action" JSONB,
    "audio" JSONB,
    "prompt" JSONB NOT NULL DEFAULT '{"source":"auto"}',
    "approved_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "state" "AssetState" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_character_id" TEXT,
    "appearance" JSONB,
    "data" JSONB NOT NULL DEFAULT '{}',
    "reference_images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "file_size_bytes" BIGINT,
    "resolution" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "source" "MediaSource" NOT NULL,
    "generation_metadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_asset_requirements" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "asset_id" TEXT NOT NULL,
    "variant_key" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'pending',
    "candidate_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approved_media_id" TEXT,
    "generation_job_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visual_asset_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "positive" TEXT NOT NULL,
    "negative" TEXT,
    "source" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outputs" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "status" "OutputStatus" NOT NULL DEFAULT 'queued',
    "video_url" TEXT,
    "thumbnail_url" TEXT,
    "provider" TEXT NOT NULL,
    "provider_job_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_version" TEXT,
    "parameters" JSONB NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "resolution" TEXT,
    "file_size_bytes" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "prompt_snapshot" JSONB NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "visual_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_code" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT,
    "provider_job_id" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "order" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "project_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_secret" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "units" DECIMAL(18,6) NOT NULL,
    "estimated_cost" DECIMAL(18,6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_family_id_idx" ON "refresh_tokens"("user_id", "family_id");

-- CreateIndex
CREATE INDEX "projects_owner_id_deleted_at_idx" ON "projects"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "stories_project_id_order_deleted_at_idx" ON "stories"("project_id", "order", "deleted_at");

-- CreateIndex
CREATE INDEX "scenes_story_id_order_deleted_at_idx" ON "scenes"("story_id", "order", "deleted_at");

-- CreateIndex
CREATE INDEX "scenes_project_id_deleted_at_idx" ON "scenes"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "shots_scene_id_order_deleted_at_idx" ON "shots"("scene_id", "order", "deleted_at");

-- CreateIndex
CREATE INDEX "shots_project_id_deleted_at_idx" ON "shots"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "assets_project_id_type_state_deleted_at_idx" ON "assets"("project_id", "type", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "assets_base_character_id_idx" ON "assets"("base_character_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_project_id_media_type_deleted_at_idx" ON "media"("project_id", "media_type", "deleted_at");

-- CreateIndex
CREATE INDEX "visual_asset_requirements_scene_id_asset_type_asset_id_vari_idx" ON "visual_asset_requirements"("scene_id", "asset_type", "asset_id", "variant_key");

-- CreateIndex
CREATE INDEX "visual_asset_requirements_scene_id_status_deleted_at_idx" ON "visual_asset_requirements"("scene_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "prompt_versions_shot_id_created_at_idx" ON "prompt_versions"("shot_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outputs_provider_job_id_key" ON "outputs"("provider_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "outputs_idempotency_key_key" ON "outputs"("idempotency_key");

-- CreateIndex
CREATE INDEX "outputs_shot_id_status_idx" ON "outputs"("shot_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_idempotency_key_key" ON "tasks"("idempotency_key");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_provider_provider_job_id_idx" ON "tasks"("provider", "provider_job_id");

-- CreateIndex
CREATE INDEX "workflow_runs_project_id_status_idx" ON "workflow_runs"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_run_id_order_key" ON "workflow_steps"("workflow_run_id", "order");

-- CreateIndex
CREATE INDEX "audit_logs_project_id_entity_type_entity_id_idx" ON "audit_logs"("project_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_user_id_provider_key" ON "provider_credentials"("user_id", "provider");

-- CreateIndex
CREATE INDEX "provider_usage_project_id_provider_created_at_idx" ON "provider_usage"("project_id", "provider", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_asset_requirements" ADD CONSTRAINT "visual_asset_requirements_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outputs" ADD CONSTRAINT "outputs_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
