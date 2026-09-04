-- CreateTable
CREATE TABLE "ScheduledAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "dayOfWeek" INTEGER NOT NULL,
    "blockStartMinutes" INTEGER NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 1,
    "posterPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WatchProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ScheduledAppointment_dayOfWeek_blockStartMinutes_idx" ON "ScheduledAppointment"("dayOfWeek", "blockStartMinutes");

-- CreateIndex
CREATE UNIQUE INDEX "WatchProgress_tmdbId_mediaType_season_episode_key" ON "WatchProgress"("tmdbId", "mediaType", "season", "episode");
