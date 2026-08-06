-- Upcoming event data belongs to dated relations, never to manually maintained Item fields.
ALTER TABLE "Event" ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "Item"
DROP COLUMN "nextEventDate",
DROP COLUMN "nextEventLabel",
DROP COLUMN "nextEventUrgency";
