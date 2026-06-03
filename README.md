# World Cup '26 Sweep

A GitHub Pages sweepstake app for the 2026 FIFA World Cup. Built for the **Everything But** group.

- **48 teams**, 12 groups of 4 (the real 2026 final draw).
- **Animated live draw** — shuffles the draw order, then deals every team out slot-machine style.
- **Last team standing** — whoever owns the eventual champion takes the pot.
- **Group stage + knockout bracket** tabs that fill in as the tournament plays out, with each team tagged by the boy who drew it.
- **Auto-updating results** — a GitHub Action pulls live scores and updates the app on its own.
- **Shared live state** via a `data.json` file synced to GitHub (admin uses a personal access token; everyone else just views).

No build step. Vanilla HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell and views |
| `style.css` | Stadium-broadcast theme |
| `app.js` | Draw, scoring, groups, bracket, GitHub sync |
| `data.json` | The single source of truth (teams, boys, draw, schedule, results) |
| `scripts/update_results.py` | Pulls results from openfootball, fills the schedule, derives who's still alive |
| `.github/workflows/update-results.yml` | Runs the updater on a schedule + on demand |

## How it works

1. **The Draw** — add the boys, hit *Run the draw*. The order is shuffled and all 48 teams are dealt out with animation, then saved.
2. **Groups** — the 12 group tables, computed live from results, top two highlighted, plus fixtures. Each team is tagged with its owner.
3. **Knockout** — the full bracket, Round of 32 → Final (+ third-place), teams filling in as groups finish.
4. **Standings** — boys ranked by how many of their teams are still alive.
5. **Teams** — manual override: the admin can mark teams out / crown the champion by hand (useful if the feed lags).

## Auto-updating results

A scheduled **GitHub Action** (`.github/workflows/update-results.yml`) runs every ~20 minutes during the tournament window (and on demand from the Actions tab). It runs `scripts/update_results.py`, which:

- pulls the public-domain schedule + results from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) (no API key),
- fills in scores, resolves knockout fixtures, recomputes group standings,
- derives each team's alive/out status and the champion,
- commits `data.json` if anything changed → Pages serves the update to everyone.

This is **semi-live**: latency depends on how quickly openfootball is updated after a match (minutes to ~an hour) plus the 20-minute cron. The auto-update is authoritative; if it ever lags, the admin can set results by hand in the **Teams** tab (the next auto-run will reconcile). Run `python3 scripts/update_results.py --dry-run` locally to preview.

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
