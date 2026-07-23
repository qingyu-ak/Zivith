-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimated_cost" DECIMAL(18,6),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_records_project_id_created_at_idx" ON "usage_records"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_records_project_id_task_type_idx" ON "usage_records"("project_id", "task_type");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
