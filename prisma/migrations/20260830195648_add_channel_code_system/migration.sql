-- CreateTable
CREATE TABLE "RegisteredShow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prefix" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "channelNumber" INTEGER NOT NULL,
    "posterPath" TEXT,
    "totalSeasons" INTEGER NOT NULL DEFAULT 0,
    "totalCodes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EpisodeCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "airDate" TEXT,
    "episodeTitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EpisodeCode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "RegisteredShow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredShow_prefix_key" ON "RegisteredShow"("prefix");

-- CreateIndex
CREATE INDEX "RegisteredShow_tmdbId_idx" ON "RegisteredShow"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeCode_code_key" ON "EpisodeCode"("code");

-- CreateIndex
CREATE INDEX "EpisodeCode_showId_idx" ON "EpisodeCode"("showId");

-- CreateIndex
CREATE INDEX "EpisodeCode_code_idx" ON "EpisodeCode"("code");
