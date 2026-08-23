-- CreateTable
CREATE TABLE "novel_imports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source_filename" TEXT NOT NULL,
    "total_chapters" INTEGER NOT NULL DEFAULT 0,
    "processed_chapters" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'rule',
    "config" JSONB NOT NULL DEFAULT '{}',
    "report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novel_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novel_import_chapters" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "chapter_index" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "extracted_entity_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "novel_import_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roleplay_threads" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "character_asset_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "anchored_world_event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roleplay_threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "novel_imports_project_id_created_at_idx" ON "novel_imports"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "novel_import_chapters_import_id_chapter_index_key" ON "novel_import_chapters"("import_id", "chapter_index");

-- CreateIndex
CREATE INDEX "roleplay_threads_project_id_character_asset_id_idx" ON "roleplay_threads"("project_id", "character_asset_id");

-- CreateIndex
CREATE INDEX "roleplay_threads_thread_id_idx" ON "roleplay_threads"("thread_id");

-- AddForeignKey
ALTER TABLE "novel_import_chapters" ADD CONSTRAINT "novel_import_chapters_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "novel_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
