# World Cup '26 Sweep - Handover

**Owner:** Daniel Fainsinger (Strategy & Ops)
**Last updated:** 2026-06-30
**Status:** Active
**Repo:** `f1atty/world-cup-sweep` (public, standalone; transferred from danielf-neara, which remains a collaborator so this CLI can still push)

<!--
Living snapshot, not a changelog. Update the date whenever you touch it.
-->

## What it is

A GitHub Pages web app for a **2026 FIFA World Cup sweepstake** for Daniel and his friends (the **"Everything But"** group, ~12-13 people, called "the boys" in the UI). Scoring is **last team standing**: whoever owns the eventual champion wins the pot. Vanilla HTML/CSS/JS, no build step; static `data.json` holds the teams + the locked draw, and the entire live schedule (structure and scores) is fetched from ESPN in the browser.

- **Live URL:** https://f1atty.github.io/world-cup-sweep/
- **Local clone:** `/Users/danielfainsinger/Documents/GitHub/world-cup-sweep/`
- **Aesthetic:** dark "stadium at night" - pitch-green/black, lime + magenta + cyan accents, gold for trophy moments. Fonts: Anton (display) + Manrope (body).

## Current status

- **Draw is locked and baked into `data.json`** (`DATA.draw.locked`), survives reload. No GitHub token needed for normal running - every visitor is a spectator and the Pages URL is the view-only link.
- **Live results work, single source = ESPN.** Whole schedule (structure + scores) fetched client-side from ESPN's public scoreboard in one key-free, CORS-open request; refreshes on load and every 90s. Near-live (~1 min lag).
- **No GitHub Action and no results commits** - results are a live read, never written back.
- **openfootball dropped (2026-06-28).** ESPN now resolves knockout teams immediately, so group-stage elimination resolves promptly (the old openfootball lag wrongly marked qualified teams as OUT).
- **Most recent work (2026-06-29):** finished knockout ties now stay in their correct bracket slot in the Knockout tab.

## How to run / access

**To view (normal use):** open the live URL - no auth, no setup.

**To resume / develop locally:**
1. `cd "/Users/danielfainsinger/Documents/GitHub/world-cup-sweep" && git pull` (no auto-update bot - pulls are only your own commits).
2. Serve locally: `python3 -m http.server 8765`, then open `http://localhost:8765`.

**To re-draw (admin path, normally idle):** the token path still exists (`canEdit()`, `body.spectator`, `.admin-only`, `DEFAULT_REPO`). Paste a fine-grained PAT (**Contents: Read & write**, scoped to `world-cup-sweep`) on the Settings tab, unlock (two confirmations via `#unlockDraw`), redraw and re-lock - that commits the new draw to `data.json`. Token is stored only in that browser's localStorage (`wcs_config`), never committed.

## How it works

**Tabs (views in `index.html`, logic in `app.js`):**

| Tab | What it does |
|-----|--------------|
| The Draw | Two-step draw (see Key decisions) |
| Match Centre | FotMob-style day-by-day fixtures, per-viewer timezone, FT/LIVE/kickoff, owner tags. Default landing tab |
| Groups | 12 live group tables computed from results, top-2 highlighted, fixtures, owner tags |
| Knockout | Full bracket R32 → Final (+ third place), tree-ordered, owner tags, fills in as groups finish |
| Standings | Boys ranked by teams still alive; winner banner when champion is set |
| Teams | Manual override tracker. Mostly vestigial: results fetched live, so a refresh overwrites manual edits |
| Settings | GitHub sync config, JSON export/import, reset/danger zone |

**Live results engine:** ESPN scoreboard fetched once (`site.api.espn.com/.../soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=200`). `buildSchedule(espn)` numbers events 1..104 by ascending `event.id`; stage from `season.slug`, group letter from `data.json`, teams/score/status from competitors. Knockout slot labels (e.g. `Round of 32 3 Winner`) convert to existing `W<num>`/`L<num>` bracket refs. Core functions: `refreshResults` / `buildSchedule` / `deriveStatus`. If the fetch fails, the `localStorage` (`wcs_results`) last-good cache is restored.

## File / directory map

| Path | What it is |
|------|-----------|
| `index.html` | App shell + all views (tabs) |
| `style.css` | All styling (stadium theme + mobile rules) |
| `app.js` | Everything client-side: draw, scoring, groups, bracket, match centre, live-results engine |
| `data.json` | Static: teams, boys, locked draw, fixture skeleton, champion seed. No live scores |
| `trophy.png` | Header trophy image (`.trophy-img`); inline SVG kept as hidden fallback |
| `scripts/update_results.py` | **No longer run or used** (openfootball-based; Action removed). Kept only as the historical reference the JS engine was ported from |
| `README.md` | Public-facing readme |

## Key decisions & gotchas

**The draw (two separate draws):**
- **Draw 1 - "Draw the order"** (`drawOrder()`): random animated shuffle of the boys, locks the running order, saves.
- **Draw 2 - "Draw the teams"** (`drawTeams()`): pokie/slot-machine animation - boys down the left, a spinning vertical reel (`spinReel()`) on the right; each locked team pops into the on-the-clock boy's row. Deals in drawn order.
- **Equal split + the pot:** every boy gets `floor(48 / N)` teams. Leftovers go to **"40th Trip"** (`HOUSE` constant), shown as its own gold card. 12 boys → 4 each, 40th Trip 0. 13 → 3 each, 40th Trip 9. 11 → 4 each, 40th Trip 4.
- Re-running wipes allocations (confirm-guarded). Lock badge 🔒 shows when locked; Re-run hidden, Re-run/Reset/Wipe all blocked. Unlock takes two confirmations. UI driven by `updateLockUI()`.
- **Draw style** (radio `input[name="drawMode"]`, default **pots**): `pots` (per-pot by ranking, top N revealed last, "Round X" banner via `showRoundBanner`), `potsplay` (40th Trip plays; `P=N+1`; dregs go to 40th Trip or a separate unowned **Dregs** bucket `DREGS='Dregs'`, excluded from `championOwner()`/standings), `seeds` (top-N seeds first then random), `random`. `#houseLowToggle` (seeds/random only when rem>0) sends rem lowest-ranked to 40th Trip.
- **Seeds (1-48)** come from the official FIFA Men's World Ranking (inside.fifa.com API), baked into `SEED_ORDER` in `app.js` and applied on every load in `normalise()` - so a `data.json` merge or auto-update commit can't wipe them. To re-seed, edit `SEED_ORDER`. (Earlier bug: seeds lived only in `data.json` and got wiped by a merge, so "dregs" picked the last groups instead of the lowest-ranked - fixed by baking into app.js.)

**openfootball dropped (2026-06-28):** the app used to take fixture/bracket **structure** from openfootball and overlay ESPN **scores**. openfootball's knockout wiring lagged group results by hours, leaving R32 slots as placeholders (`1I`, `3A/B/C/D/F`) and wrongly marking qualified teams OUT. ESPN resolves knockout teams immediately, so it is now the only source. Bracket numbering is now ESPN's own. Old overlay helpers (`espnScoreIndex`/`overlayEspnScores`/`kickoffUtc`/`ofScores`) removed.

**Bracket ties (fixed 2026-06-29):** ESPN drops a slot's "winner of match N" ref once its feeder finishes. `bracketOrder()` keeps finished ties in their correct slot by matching each resolved team back to the prior-round match it won. Previously a tie vanished from its column the moment it was played.

**Other conventions / gotchas:**
- **Times** default to Sydney (AEST); each viewer can switch zone (Sydney/London/New York) via the Match Centre picker. Persists in `localStorage` (`TZ_KEY='wcs_tz'`); zones in `TZS`; helpers `displayZone()`/`displayZoneLabel()`/`setDisplayZone()`. DST-safe via `Intl`. Kickoffs stored as UTC ISO, rendered in chosen zone.
- **Match Centre owners on mobile** render on a dedicated portrait row (`mcOwnerChip`/`mcOwnersHTML`); inline on desktop.
- **Active tab persists** across refresh (`localStorage wcs_view`); first-time default is Match Centre.
- **Hide-the-Settings-tab toggle:** `DATA.meta.hideSettingsTab` (`settingsHidden()`, `settingsTabVisible()`, `adminHashOpen()`, `#toggleSettingsTab`, `updateSettingsTab()`). Re-open via `#settings` or `#admin` URL hash; stays visible on admin's own browser.
- **"LIVE" in Match Centre is a time heuristic** (within ~2.5h of kickoff, not yet finished), not the true ESPN in-play state (`status.type.state === 'in'`) we could switch to. In-progress scores show during the window but don't count toward group tables until FT.
- **No visual QA done in-browser** during the build (Claude-in-Chrome wasn't connecting). All logic verified via Node VM harness; if a phone view looks off, check bracket/match-centre row widths first.
- **Mobile-first** is the priority. Australian English; no em dashes.
- **Team data accuracy:** 48 teams + groups cross-checked against Wikipedia 2026 draw + openfootball, matched exactly. ESPN name diffs (Czechia, Türkiye, Congo DR, Bosnia-Herzegovina) handled at runtime in `ESPN_NAME_FIX`. Any team editable directly in `data.json` (`name`/`group`/`flag`).

## Open tasks / next steps

- [ ] Optional: switch "LIVE" from the time heuristic to ESPN's true in-play state (`status.type.state === 'in'`).
- [ ] Idea (not committed): per-team goal totals / a "your live teams today" highlight for each boy.

## Dependencies, integrations & contacts

- **ESPN public scoreboard** - `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard` - single source for all fixtures and scores. Key-free, CORS-open. No account.
- **GitHub Pages** - hosting at `f1atty.github.io/world-cup-sweep`. Repo `f1atty/world-cup-sweep` (Daniel's `danielf-neara` is a collaborator for CLI pushes).
- **Fine-grained PAT** - only needed for the re-draw admin path; created ad hoc, scoped to this repo (Contents: Read & write), stored in browser localStorage only.
- **FIFA Men's World Ranking** (inside.fifa.com API) - source of the seed order baked into `SEED_ORDER`. Reference only, not called at runtime.
- **Auto-memory:** `~/.claude/projects/-Users-danielfainsinger-Documents-GitHub-experiments/memory/world-cup-sweep.md` carries additional context.
- **Contact:** Daniel Fainsinger (owner / only maintainer).

## Data model (`data.json`)

- `meta`: title, subtitle ("Everything But · Last Team Standing"), `lastResultSync`, `hideSettingsTab`.
- `teams[]`: `{id, name, group, flag, status}` - status `alive`|`out`. 48 teams.
- `boys[]`: participant names.
- `draw`: `{completed, order[], allocations{}, locked}`. `allocations` keyed by boy name (+ `"40th Trip"`).
- `champion`: team id or null.
- `schedule[]`: 104 matches - `{num, stage, group, date, kickoff, t1, t2, ref1, ref2, s1, s2, p1, p2, status}`.
  - Match numbers: group 1-72, R32 73-88, R16 89-96, QF 97-100, SF 101-102, 3P 103, F 104.
  - Knockout `ref1/ref2` are slot labels ("2A", "3A/B/C/D/F", "W101") until resolved to `t1/t2`.
  - `kickoff` is a UTC ISO instant; frontend renders it in the viewer's chosen zone (default Australia/Sydney).
