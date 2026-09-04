-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropUrl" TEXT,
    "releaseYear" TEXT,
    "overview" TEXT,
    "voteAverage" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserWatchHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropUrl" TEXT,
    "releaseYear" TEXT,
    "season" INTEGER NOT NULL DEFAULT 0,
    "episode" INTEGER NOT NULL DEFAULT 0,
    "episodeTitle" TEXT,
    "progressSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "lastWatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserPersonalSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropUrl" TEXT,
    "runtimeMinutes" INTEGER,
    "dayOfWeek" INTEGER NOT NULL,
    "blockStartMinutes" INTEGER NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 1,
    "currentSeason" INTEGER NOT NULL DEFAULT 1,
    "currentEpisode" INTEGER NOT NULL DEFAULT 1,
    "totalEpisodes" INTEGER,
    "lastAiredDate" TEXT,
    "lastAiredSeason" INTEGER,
    "lastAiredEpisode" INTEGER,
    "wasWatched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserMissedBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "scheduleId" TEXT,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropUrl" TEXT,
    "season" INTEGER,
    "episode" INTEGER,
    "episodeTitle" TEXT,
    "originalAirDate" TEXT NOT NULL,
    "originalAirTime" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserChannelSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL DEFAULT 'My Lineup',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSeasonCompletedAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropUrl" TEXT,
    "completedSeason" INTEGER NOT NULL,
    "nextSeason" INTEGER,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "_AccessCodeToRegisteredShow" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_AccessCodeToRegisteredShow_A_fkey" FOREIGN KEY ("A") REFERENCES "AccessCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_AccessCodeToRegisteredShow_B_fkey" FOREIGN KEY ("B") REFERENCES "RegisteredShow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduledAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT 'anonymous',
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "channelNumber" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "blockStartMinutes" INTEGER NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 1,
    "runtimeMinutes" INTEGER,
    "posterPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScheduledAppointment" ("blockCount", "blockStartMinutes", "channelNumber", "createdAt", "dayOfWeek", "episode", "id", "mediaType", "posterPath", "runtimeMinutes", "season", "title", "tmdbId", "updatedAt") SELECT "blockCount", "blockStartMinutes", "channelNumber", "createdAt", "dayOfWeek", "episode", "id", "mediaType", "posterPath", "runtimeMinutes", "season", "title", "tmdbId", "updatedAt" FROM "ScheduledAppointment";
DROP TABLE "ScheduledAppointment";
ALTER TABLE "new_ScheduledAppointment" RENAME TO "ScheduledAppointment";
CREATE INDEX "ScheduledAppointment_sessionId_idx" ON "ScheduledAppointment"("sessionId");
CREATE INDEX "ScheduledAppointment_sessionId_dayOfWeek_blockStartMinutes_idx" ON "ScheduledAppointment"("sessionId", "dayOfWeek", "blockStartMinutes");
CREATE INDEX "ScheduledAppointment_dayOfWeek_blockStartMinutes_idx" ON "ScheduledAppointment"("dayOfWeek", "blockStartMinutes");
CREATE INDEX "ScheduledAppointment_channelNumber_dayOfWeek_idx" ON "ScheduledAppointment"("channelNumber", "dayOfWeek");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserFavorite_sessionId_idx" ON "UserFavorite"("sessionId");

-- CreateIndex
CREATE INDEX "UserFavorite_tmdbId_idx" ON "UserFavorite"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_sessionId_tmdbId_mediaType_key" ON "UserFavorite"("sessionId", "tmdbId", "mediaType");

-- CreateIndex
CREATE INDEX "UserWatchHistory_sessionId_idx" ON "UserWatchHistory"("sessionId");

-- CreateIndex
CREATE INDEX "UserWatchHistory_lastWatchedAt_idx" ON "UserWatchHistory"("lastWatchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserWatchHistory_sessionId_tmdbId_mediaType_season_episode_key" ON "UserWatchHistory"("sessionId", "tmdbId", "mediaType", "season", "episode");

-- CreateIndex
CREATE INDEX "UserPersonalSchedule_sessionId_idx" ON "UserPersonalSchedule"("sessionId");

-- CreateIndex
CREATE INDEX "UserPersonalSchedule_sessionId_dayOfWeek_idx" ON "UserPersonalSchedule"("sessionId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "UserPersonalSchedule_sessionId_dayOfWeek_blockStartMinutes_key" ON "UserPersonalSchedule"("sessionId", "dayOfWeek", "blockStartMinutes");

-- CreateIndex
CREATE INDEX "UserMissedBroadcast_sessionId_isResolved_idx" ON "UserMissedBroadcast"("sessionId", "isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "UserChannelSettings_sessionId_key" ON "UserChannelSettings"("sessionId");

-- CreateIndex
CREATE INDEX "UserSeasonCompletedAlert_sessionId_isDismissed_idx" ON "UserSeasonCompletedAlert"("sessionId", "isDismissed");

-- CreateIndex
CREATE UNIQUE INDEX "_AccessCodeToRegisteredShow_AB_unique" ON "_AccessCodeToRegisteredShow"("A", "B");

-- CreateIndex
CREATE INDEX "_AccessCodeToRegisteredShow_B_index" ON "_AccessCodeToRegisteredShow"("B");
