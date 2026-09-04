/*
  Warnings:

  - Added the required column `channelNumber` to the `ScheduledAppointment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduledAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "channelNumber" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "blockStartMinutes" INTEGER NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 1,
    "posterPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScheduledAppointment" ("blockCount", "blockStartMinutes", "createdAt", "dayOfWeek", "episode", "id", "mediaType", "posterPath", "season", "title", "tmdbId", "updatedAt") SELECT "blockCount", "blockStartMinutes", "createdAt", "dayOfWeek", "episode", "id", "mediaType", "posterPath", "season", "title", "tmdbId", "updatedAt" FROM "ScheduledAppointment";
DROP TABLE "ScheduledAppointment";
ALTER TABLE "new_ScheduledAppointment" RENAME TO "ScheduledAppointment";
CREATE INDEX "ScheduledAppointment_dayOfWeek_blockStartMinutes_idx" ON "ScheduledAppointment"("dayOfWeek", "blockStartMinutes");
CREATE INDEX "ScheduledAppointment_channelNumber_dayOfWeek_idx" ON "ScheduledAppointment"("channelNumber", "dayOfWeek");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
