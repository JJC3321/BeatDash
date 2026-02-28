
# Make Music Drive the Game

## Overview
Right now the game is generated based only on the playlist **name**. We'll enhance this to actually analyze the playlist's real music data from Spotify and use those metrics to directly influence gameplay mechanics.

## What Changes

### 1. Add Spotify API Credentials
The project already has a `spotify-analyze` backend function that fetches real audio features (tempo, energy, danceability, etc.) from Spotify. However, it requires **Spotify API credentials** (Client ID and Client Secret) which are not yet configured. You'll need to provide these -- they're free to get from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

### 2. Update the Generation Flow
When a user pastes a playlist URL:
1. **Step 1 -- Analyze**: Call the existing `spotify-analyze` function to get real metrics (tempo, energy, valence, danceability, acousticness)
2. **Step 2 -- Generate**: Pass those real metrics to the AI so it designs a game based on actual music characteristics, not just the name
3. **Step 3 -- Play**: Feed the metrics into the game engine so gameplay responds to the music's properties

### 3. Music-Driven Gameplay Mechanics
The game engine will use real playlist metrics to control gameplay:

| Music Feature | Game Effect |
|---|---|
| **Tempo (BPM)** | Controls obstacle/spawn speed -- faster songs = faster obstacles |
| **Energy** | Controls difficulty and chaos -- high energy = more enemies, less predictable patterns |
| **Danceability** | Controls rhythmic spawn patterns -- high danceability = enemies spawn in rhythmic waves |
| **Valence** (happiness) | Controls visual effects -- happy = brighter particles/effects, sad = darker, moodier |
| **Acousticness** | Controls game gentleness -- acoustic = slower, floatier physics |

### 4. Enhanced AI Prompt
Update the AI prompt to receive real Spotify audio features and design the game around them, with explicit instructions to make the game feel like the music (e.g., "This playlist has 140 BPM average tempo and 0.8 energy -- design an intense, fast-paced game").

### 5. Visual Beat Indicators
Add subtle visual pulses in the game background that sync with the playlist's average tempo, creating a feeling that the game world is alive with the music's rhythm.

## Technical Details

### Files Modified
- **`src/pages/Index.tsx`** -- Add spotify-analyze call before gemini-generate; pass metrics through
- **`supabase/functions/gemini-generate/index.ts`** -- Update prompt to receive and use real audio features
- **`src/game/engine.ts`** -- Add tempo-based spawn patterns, energy-based difficulty scaling, background pulse effect tied to BPM
- **`src/types/game.ts`** -- Add `PlaylistMetrics` to `GameConfiguration` so the engine has access to music data
- **`src/components/screens/LoadingScreen.tsx`** -- Add a "Spotify analysis" loading step

### Secrets Needed
- `SPOTIFY_CLIENT_ID` -- from Spotify Developer Dashboard
- `SPOTIFY_CLIENT_SECRET` -- from Spotify Developer Dashboard
