# World Cup '26 Sweep

A GitHub Pages sweepstake app for the 2026 FIFA World Cup. Built for the **Everything But** group.

- **48 teams**, 12 groups of 4 (the real 2026 final draw).
- **Animated live draw** — shuffles the draw order, then deals every team out slot-machine style.
- **Last team standing** — whoever owns the eventual champion takes the pot.
- **Shared live state** via a `data.json` file synced to GitHub (admin uses a personal access token; everyone else just views).

No build step. Vanilla HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell and views |
| `style.css` | Stadium-broadcast theme |
| `app.js` | Draw logic, scoring, GitHub sync |
| `data.json` | The single source of truth (teams, boys, draw, results) |

## How it works

1. **The Draw** — add the boys, hit *Run the draw*. The order is shuffled and all 48 teams are dealt out with animation, then saved.
2. **Standings** — boys ranked by how many of their teams are still alive.
3. **Teams** — the admin marks teams out as they're knocked out, and crowns the champion. The champion's owner wins.

## Sharing with the boys (GitHub sync)

So everyone sees the same live draw and results:

1. Host this folder as its own GitHub repo with **Pages enabled** (recommended repo name: `world-cup-sweep`).
2. Open the deployed site → **Settings** tab → fill in repo owner / name / branch / path.
3. Create a **fine-grained personal access token** with **Contents: Read & write** on the repo (or a classic token with the `repo` scope). Paste it into the token field and *Save config*.
4. Run the draw / record results — the app commits straight back to `data.json`.
5. The boys just open the Pages URL. No token = read-only view of the latest committed data.

The token is stored only in the admin's browser (`localStorage`) and is never committed.

## Notes

- Team list reflects the 2026 final draw as published. Any single team can be corrected directly in `data.json` (`name`, `group`, `flag`).
- Local backup: **Settings → Export / Import JSON**.
