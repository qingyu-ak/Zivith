-- CreateTable
CREATE TABLE "workflow_step_attempts" (
    "id" TEXT NOT NULL,
    "workflow_step_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "model" TEXT,
    "input_hash" TEXT NOT NULL,
    "usage" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "workflow_step_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_step_attempts_workflow_step_id_status_idx" ON "workflow_step_attempts"("workflow_step_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_step_attempts_workflow_step_id_attempt_key" ON "workflow_step_attempts"("workflow_step_id", "attempt");

-- AddForeignKey
ALTER TABLE "workflow_step_attempts" ADD CONSTRAINT "workflow_step_attempts_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
