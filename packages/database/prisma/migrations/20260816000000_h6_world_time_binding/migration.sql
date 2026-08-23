-- H6: Project-defined TemporalDimension + TimelineItem WorldTimeBinding envelope.
-- Calendar values stay opaque JSON; empty arrays mean follow Presentation Time.

ALTER TABLE "project_timelines" ADD COLUMN "temporal_dimensions" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "timeline_items" ADD COLUMN "world_time_bindings" JSONB NOT NULL DEFAULT '[]';
