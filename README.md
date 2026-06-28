# World Cup '26 Sweep

A GitHub Pages sweepstake app for the 2026 FIFA World Cup. Built for the **Everything But** group.

- **48 teams**, 12 groups of 4 (the real 2026 final draw).
- **Animated live draw** — shuffles the draw order, then deals every team out slot-machine style.
- **Last team standing** — whoever owns the eventual champion takes the pot.
- **Group stage + knockout bracket** tabs that fill in as the tournament plays out, with each team tagged by the boy who drew it.
- **Live results.** The browser fetches the whole schedule (structure and scores) from ESPN's public scoreboard, no key and no GitHub Action.
- **Shared draw** baked into a static `data.json`; results are a live read, so no token is needed for normal viewing.

No build step. Vanilla HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell and views |
| `style.css` | Stadium-broadcast theme |
| `app.js` | Draw, scoring, groups, bracket, and the live-results engine (fetches the schedule from ESPN) |
| `data.json` | Static: teams, boys, the locked draw, champion seed (no live scores; fetched at runtime) |
| `scripts/update_results.py` | Historical reference only (openfootball-based, no longer run or used) |

## How it works

1. **The Draw** — two steps: *Draw the order* shuffles the running order and locks it in, then *Draw the teams* deals the 48 teams out with animation. Every boy gets an equal share; any leftover teams go to **40th Trip** (the pot). Both steps save automatically.
2. **Groups** — the 12 group tables, computed live from results, top two highlighted, plus fixtures. Each team is tagged with its owner.
3. **Knockout** — the full bracket, Round of 32 → Final (+ third-place), teams filling in as groups finish.
4. **Standings** — boys ranked by how many of their teams are still alive.
5. **Teams** — manual override: the admin can mark teams out / crown the champion by hand (useful if the feed lags).

## Live results

The browser fetches the whole schedule from **ESPN's public scoreboard** in a single request on load and every 90 seconds. There is no GitHub Action and no API key:

- one ESPN fetch supplies both the fixture/bracket **structure** and the live **scores**,
- the engine (`buildSchedule`) numbers the 104 matches, reads each match's stage, group, teams, score and status, and resolves knockout matchups into the bracket,
- it then derives each team's alive/out status and the champion client-side.

Latency is roughly ESPN's own lag (about a minute). Results are a live read and are never committed back. If a fetch fails, the last-good cache in the browser's `localStorage` is restored. If the feed ever looks wrong, the admin can set results by hand in the **Teams** tab (a refresh will overwrite manual edits with the live feed).

> **openfootball was dropped on 2026-06-28.** The app previously took fixture/bracket **structure** from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) and overlaid ESPN scores on top. openfootball's knockout bracket wiring lagged the group results by hours (leaving Round-of-32 slots as placeholders), which wrongly marked qualified teams as OUT. ESPN resolves the knockout teams immediately, so it is now the single source. `scripts/update_results.py` was the openfootball-based updater and is no longer run or used (kept only as a historical reference).

## Sharing with the boys (GitHub sync)

So everyone sees the same live draw and results:

1. Host this folder as its own GitHub repo with **Pages enabled** (recommended repo name: `world-cup-sweep`).
2. Open the deployed site → **Settings** tab → fill in repo owner / name / branch / path.
3. Create a **fine-grained personal access token** with **Contents: Read & write** on the repo (or a classic token with the `repo` scope). Paste it into the token field and *Save config*.
4. Run the draw. The app commits the locked draw straight back to `data.json`. (Results are not committed; they are read live from ESPN at runtime.)
5. The boys just open the Pages URL. No token = read-only view of the latest committed draw, with live results layered on top.

The token is stored only in the admin's browser (`localStorage`) and is never committed.

## Notes

- Team list reflects the 2026 final draw as published. Any single team can be corrected directly in `data.json` (`name`, `group`, `flag`).
- Local backup: **Settings → Export / Import JSON**.
