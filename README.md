# BeatDash

Turn a Spotify playlist into a Geometry Dash-inspired auto-runner with AI-generated gameplay tuning, theming, and per-track map patterns.

## What the app does

1. Accepts a Spotify playlist URL or playlist ID
2. Calls `spotify-analyze` to estimate playlist metrics and normalized per-track data
3. Calls `gemini-generate` to create a game configuration from those metrics
4. Calls `gemini-generate-map` for song-specific obstacle patterns
5. Runs gameplay in a React + Excalibur-based front end, with fallback maps if AI generation fails

## Current feature set

- Spotify playlist ingestion from URL or ID
- Playlist analysis with fallback behavior when Spotify credentials are missing or API calls fail
- Gemini-driven game config generation (difficulty, speed, colors, asset style)
- Gemini-driven track map generation with enforced playability constraints
- Map caching and preloading for smoother transitions between tracks
- Fallback pre-made map generation for reliability
- Unit tests for `mapGenerator` behavior (caching, fallback flow, preloading)

## Tech stack

- Front end: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- Game runtime: Excalibur
- Data/service layer: Supabase JS client + Supabase Edge Functions
- AI: Google Gemini API (tool/function-calling style responses)
- Music source: Spotify Web API
- Testing: Vitest + Testing Library + JSDOM

## Repository structure

- `src/pages/Index.tsx`: main app flow (input -> loading -> game)
- `src/components/screens/`: landing/loading/game screens
- `src/game/`: game engine, assets, map generation, fallback reference maps
- `src/integrations/supabase/`: Supabase web client setup
- `supabase/functions/spotify-analyze/`: playlist and track metric estimation
- `supabase/functions/gemini-generate/`: game configuration generation
- `supabase/functions/gemini-generate-map/`: per-track map generation
- `src/test/`: automated tests

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm
- A Supabase project with Edge Functions enabled
- Spotify app credentials (for best analysis quality)
- Gemini API key

## Environment variables

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_or_publishable_key
```

Set these secrets for Supabase Edge Functions:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `GEMINI_API_KEY`

## Local development

```bash
npm install
npm run dev
```

The app runs on Vite's default local URL unless configured otherwise.

## Available scripts

- `npm run dev`: start local dev server
- `npm run build`: production build
- `npm run build:dev`: development-mode build
- `npm run preview`: preview built app locally
- `npm run lint`: run ESLint
- `npm run test`: run Vitest once
- `npm run test:watch`: run Vitest in watch mode

## Supabase function contracts

- `spotify-analyze` input: `{ playlistId }`
  - Returns playlist metadata and estimated metrics (`avgTempo`, `avgEnergy`, `avgValence`, etc.) plus normalized track info
  - Falls back to deterministic sample metrics when Spotify access is unavailable
- `gemini-generate` input: `{ playlistName, metrics }`
  - Returns game configuration (physics/speed/difficulty, palette, assets)
- `gemini-generate-map` input: `{ track }`
  - Returns song map patterns + visual theme
  - Post-processing clamps values to playable bounds

## Reliability behavior

- If Spotify token fetch or playlist fetch fails, the app still generates a playable experience using fallback metrics.
- If map generation fails, `mapGenerator` returns a pre-made fallback map and caches it.
- Cache cleanup runs periodically and removes stale entries.

## Notes

- Spotify's legacy audio-features endpoint is deprecated, so analysis is inferred from available metadata and artist genre signals.
- This project currently focuses on a single gameplay mode: `geodash`.
