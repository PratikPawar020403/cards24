# Rummy Room 🂠

Thirteen-card Indian Rummy for 2 to 6 players, built mobile-first with live online multiplayer, round-table felt layout, custom female dealer character, and RajRummy rules engine.

## Features
- **Online Multiplayer:** Create a room, share the code or direct link with friends across phones and laptops.
- **Round-Table Layout:** Authentic oval casino table seating all players around the perimeter with zero center overlap.
- **Animated Dealer:** Animated dealer bust with custom speech bubbles, dealing motions, and reactions.
- **RajRummy Spec Engine:**
  - 13 cards dealt + wild joker cut.
  - Finish slot for dropping 14th card to declare.
  - Friendly grouping solver (validates hand regardless of screen grouping).
  - 80-point penalty confirmation on invalid declare attempts.
  - Turn alerts (title flashing and vibration) for background tabs.
  - Graceful "Leave Table" forfeit confirmation.
- **Bot Support:** Add automated AI players to fill empty seats anytime.

## Running Locally
```bash
node server.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## 1-Click Free Deployment (Render.com)
1. Push this repository to GitHub.
2. Sign in to [Render.com](https://render.com) (free).
3. Click **New +** -> **Web Service** and choose your repository.
4. Set:
   - **Start Command:** `node server.js`
5. Click **Deploy Web Service** — Render gives you a free `https://...` link that works online anywhere!
