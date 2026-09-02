-- AlterTable
ALTER TABLE "projects" ADD COLUMN "workspace_path" TEXT;

-- CreateIndex
CREATE INDEX "projects_owner_id_workspace_path_idx" ON "projects"("owner_id", "workspace_path");
