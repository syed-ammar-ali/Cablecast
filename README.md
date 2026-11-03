# 📺 Cablecast

<div align="center">

**A modern, AI-powered broadcast television simulator and personalized streaming network.**  
*Channel surfing reimagined for the modern web with real-time scheduling, nostalgic vibes, and intelligent broadcasting.*

<br/>

[![Live Production](https://img.shields.io/badge/Live%20Demo-Cablecast-black?style=for-the-badge&logo=vercel&logoColor=white)](https://cablecast-13htbtgaj-ammar-81fa.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js%2016-black?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript%205-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%20v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma%20ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Neon Postgres](https://img.shields.io/badge/Neon-Serverless%20Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=black)](https://neon.tech)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-AI%20Scheduler-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![Upstash](https://img.shields.io/badge/Upstash-QStash%20Queues-00E599?style=for-the-badge)](https://upstash.com)

<br/>

[Live Demo](https://cablecast-13htbtgaj-ammar-81fa.vercel.app) · [Key Features](#-key-features) · [Architecture & Tech Stack](#-architecture--tech-stack) · [Project Structure](#-project-structure) · [Local Development](#-local-development) · [Deployment](#-deployment)

</div>

---

## 🚀 Overview

**Cablecast** recaptures the magic of vintage linear television and channel flipping, elevated with modern on-demand streaming intelligence. Instead of endlessly scrolling static video grids, users tune in to synchronized, scheduled broadcast channels — featuring vintage cartoons, classic cinema, Asian dramas, sports highlights, and nostalgia programming.

Under the hood, Cablecast combines high-performance client playback, intelligent AI broadcast generation via **Google Gemini**, serverless database scaling on **Neon PostgreSQL**, and real-time push scheduling through **Upstash QStash**.

---

## ✨ Key Features

- **📺 Real-Time Channel Surfing & Live Schedules**: Synchronized linear broadcast schedules across curated channels (Retro Toons, Asian Cinema, VHS Archives, Sports Highlights, and Community Broadcasts).
- **🤖 Gemini AI Broadcast Scheduler**: Dynamic, intelligent programming lineups generated using Google's Gemini models (`@google/generative-ai`), maintaining narrative flow and authentic schedule blocks.
- **📼 Retro VHS & CRT Aesthetic**: Built-in VHS texture overlays, scanlines, and retro audio-visual tuning for classic era programming.
- **⚡ Adaptive HLS & Multi-Source Resolvers**: Robust streaming pipeline powered by `hls.js`, YouTube streaming integrations, and intelligent multi-server provider fallbacks.
- **🔔 Serverless Reminders & Web Push**: Exact-time delayed push notifications powered by Upstash QStash and Web Push (VAPID) so viewers never miss upcoming shows.
- **📱 Responsive & Touch-Optimized**: Custom gestures for channel flipping, volume swipe controls, and native-feeling mobile/desktop layouts.
- **🛡️ Secure Access & Administration**: Role-based access control, device fingerprinting, invite/gate codes, personal broadcast channels, and a private admin management panel.
- **📊 User Watch History & Library**: Saved playlists, watch progress tracking, and personal bookmarking stored in Neon PostgreSQL via Prisma.

---

## 🛠️ Architecture & Tech Stack

### Frontend & UI
- **Framework:** Next.js 16 (App Router)
- **Library:** React 19
- **Styling:** Tailwind CSS v4 with custom CSS variables
- **Video Playback:** Native HTML5 Video & `hls.js` adaptive bitrate streaming
- **Icons & Motion:** Lucide React, CSS keyframe CRT animations

### Backend & Serverless
- **Runtime:** Next.js Server Actions & Route Handlers
- **Database:** [Neon](https://neon.tech) Serverless PostgreSQL
- **ORM:** [Prisma ORM 6](https://www.prisma.io)
- **Auth & Security:** `jose` (stateless JWT), `bcryptjs`, and device fingerprinting
- **Validation:** Zod schemas for strict payload enforcement

### Cloud Services & Integrations
- **AI Engine:** Google Gemini API (`@google/generative-ai`)
- **Job Queue & Timers:** Upstash QStash (Serverless cron & delayed execution)
- **Push Engine:** Web Push protocol (`web-push`)
- **Metadata Providers:** The Movie Database (TMDB) API & TVMaze API
- **Hosting & Observability:** Vercel Fluid Compute, Vercel Analytics, and Speed Insights
- **Testing:** Vitest for critical security and schedule audit tests

---

## 📂 Project Structure

```text
Cablecast/
├── prisma/
│   ├── schema.prisma           # Prisma database schema for Neon Postgres
│   └── migrations/             # SQL schema migrations
├── public/                     # Static icons, branding assets, and sound effects
├── scripts/                    # Maintenance & password hashing utilities
├── src/
│   ├── app/                    # Next.js App Router (pages & API routes)
│   │   ├── admin/              # Channel & schedule management dashboard
│   │   ├── api/                # API endpoints (cron, broadcast, streams, notifications)
│   │   │   ├── broadcast/      # Broadcast resolvers and channel feeds
│   │   │   ├── cron/           # Scheduled lineup refreshes
│   │   │   ├── notifications/  # Web Push & QStash handlers
│   │   │   └── providers/      # Dynamic video stream providers
│   │   ├── broadcast/          # Live player & simulated TV experience
│   │   ├── explore/            # Program guide & channel directory
│   │   ├── gate/               # Invite / authentication gate
│   │   └── library/            # User saved titles & bookmarks
│   ├── components/             # Reusable UI components
│   │   ├── player/             # Video player, HLS wrapper, and CRT overlays
│   │   ├── schedule/           # TV guide timeline & program grid
│   │   └── ui/                 # Modals, inputs, buttons, and navigation
│   ├── config/                 # Static channel lineups and category presets
│   ├── lib/                    # Core utilities & services
│   │   ├── auth/               # JWT token issuing and crypto verification
│   │   ├── notifications/      # Upstash QStash & Web Push dispatchers
│   │   ├── streamResolver.ts   # Multi-provider video source resolver
│   │   └── tmdb.ts             # TMDB & TV metadata clients
│   └── types/                  # TypeScript interface definitions
├── .env.example                # Sample environment variables
├── next.config.ts              # Next.js configuration
├── package.json                # Project dependencies and npm scripts
└── vercel.json                 # Vercel deployment specifications
```

---

## 💻 Local Development

### Prerequisites
- **Node.js**: `v20.x` or higher
- **Package Manager**: `npm`, `pnpm`, or `bun`
- **PostgreSQL Database**: A free [Neon](https://neon.tech) database or local Postgres instance

### 1. Clone the Repository
Clone using SSH via your personal profile:
```bash
git clone git@github.com-personal:syed-ammar-ali/Cablecast.git
cd Cablecast
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the sample environment file:
```bash
cp .env.example .env.local
```
Fill in the necessary credentials:
- `DATABASE_URL`: Connection string to your Neon / Postgres database.
- `TMDB_API_KEY`: API key from [The Movie Database](https://www.themoviedb.org/).
- `GOOGLE_GENERATIVE_AI_API_KEY`: API key from [Google AI Studio](https://aistudio.google.com/).
- `QSTASH_TOKEN`: API token from [Upstash Console](https://console.upstash.com/).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`: Web Push VAPID keys (`npx web-push generate-vapid-keys`).

### 4. Sync Database Schema
```bash
npx prisma db push
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Run Test Suite
```bash
npm run test
```

---

## 🚢 Deployment

Cablecast is configured for seamless deployment on **Vercel**:

1. **GitHub CI/CD:** Any push to the `main` branch triggers an automated build and deployment on Vercel.
2. **Post-install Hook:** Automatically triggers `prisma generate` upon deployment to maintain up-to-date client types.
3. **Edge & Fluid Compute:** Optimized for low-latency streaming proxying and server-side schedule resolution.

**Production URL:** [https://cablecast-13htbtgaj-ammar-81fa.vercel.app](https://cablecast-13htbtgaj-ammar-81fa.vercel.app)

---

## 📄 License

This project is licensed under the MIT License — see the LICENSE file for details.
