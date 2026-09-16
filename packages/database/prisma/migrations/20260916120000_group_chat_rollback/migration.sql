-- AlterTable
ALTER TABLE "creator_chat_threads" ADD COLUMN "active_head_message_id" TEXT;

-- AlterTable
ALTER TABLE "creator_chat_messages" ADD COLUMN "speaker_asset_id" TEXT;
ALTER TABLE "creator_chat_messages" ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "roleplay_threads" ADD COLUMN "participant_asset_ids" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "creator_chat_messages_thread_id_suppressed_idx" ON "creator_chat_messages"("thread_id", "suppressed");
