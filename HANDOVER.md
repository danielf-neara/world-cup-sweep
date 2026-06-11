# Handover — World Cup '26 Sweep

Everything needed to pick this project back up. Read this first if you're resuming.

## What it is

A GitHub Pages web app for a **2026 FIFA World Cup sweepstake** for Daniel and his
friends (the **"Everything But"** group, ~12-13 people, called "the boys" in the UI).
Scoring is **last team standing**: whoever owns the eventual champion wins the pot.

- **Live URL:** https://f1atty.github.io/world-cup-sweep/
- **Repo:** `f1atty/world-cup-sweep` (public, standalone; transferred from danielf-neara, which remains a collaborator so this CLI can still push)
- **Local clone:** `/Users/danielfainsinger/Documents/GitHub/world-cup-sweep/`
- **Stack:** vanilla HTML/CSS/JS, no build step. Data in `data.json`, synced to GitHub.
- **Aesthetic:** dark "stadium at night" — pitch-green/black, lime + magenta + cyan accents,
  gold for trophy moments. Fonts: Anton (display) + Manrope (body).

## File map

| File | What it does |
|------|--------------|
| `index.html` | App shell + all views (tabs) |
| `style.css` | All styling (stadium theme + mobile rules) |
| `app.js` | Everything client-side: draw, scoring, groups, bracket, match centre, GitHub sync |
| `data.json` | Single source of truth: teams, boys, draw, schedule (104 matches), results, champion |
| `scripts/update_results.py` | Pulls results from openfootball, fills scores, derives alive/out + champion |
| `.github/workflows/update-results.yml` | Runs the updater on a schedule + on demand |
| `README.md` | Public-facing readme |

## The tabs

1. **The Draw** — two-step draw (see below).
2. **Match Centre** — FotMob-style day-by-day fixtures (Yesterday/Today/Tomorrow + arrows), per-viewer timezone (Sydney/London/New York), FT/LIVE/kickoff, owner tags. Defaults to today or the next match day.
3. **Groups** — 12 live group tables (computed from results), top-2 highlighted, fixtures, owner tags.
4. **Knockout** — full bracket R32 → Final (+ third place), tree-ordered, owner tags, fills in as groups finish.
5. **Standings** — boys ranked by teams still alive; winner banner when champion is set.
6. **Teams** — manual override tracker (admin marks teams out / crowns champion).
7. **Settings** — GitHub sync config, JSON export/import, reset/danger zone.

## How the draw works (two separate draws)

- **Draw 1 — "Draw the order"** (`drawOrder()`): random shuffle of the boys, animated, locks the running order, saves.
- **Draw 2 — "Draw the teams"** (`drawTeams()`): a **pokie/slot-machine** animation — boys listed down the left, a spinning vertical reel (`spinReel()`) on the right; each locked team pops into the on-the-clock boy's row so the board fills up live. Deals **in the drawn order**.
- **Equal split + the pot:** every boy gets `floor(48 / N)` teams. Any leftovers go to
  **"40th Trip"** (`HOUSE` constant) — the pot, shown as its own gold card.
  - 12 boys → 4 each, 40th Trip 0. 13 → 3 each, 40th Trip 9. 11 → 4 each, 40th Trip 4.
- Re-running wipes allocations (guarded by confirm). "Edit boys / redraw order" goes back to entry.
- **Lock draw**: `DATA.draw.locked` (persisted, survives reload + auto-update bot). "Lock the draw" button on the results board; when locked, a 🔒 badge shows, Re-run is hidden, and Re-run/Reset/Wipe are all blocked. Unlocking takes **two confirmations** (`#unlockDraw`). UI driven by `updateLockUI()`.
- **Draw style** (radio `input[name="drawMode"]`, default **pots**):
  - **pots** — `per = floor(48/N)` pots of N by ranking; each boy gets one team per pot. Revealed **lowest pot first** so the **top N come out last**; a "Round X" banner (`showRoundBanner`, `#roundBanner`) sweeps between rounds. 40th Trip's rem lowest are **auto-allocated instantly (no slot animation)** before the rounds. One slot machine reused per round.
  - **potsplay** ("Pots — 40th Trip plays") — 40th Trip is a full participant: `P = N+1` players, `perP = floor(48/P)` pots of P, everyone (incl 40th Trip, which spins like a player) draws one team per pot. The `remP` lowest leftovers go to 40th Trip OR a separate **Dregs** bucket (`#dregsBucketToggle`). `DREGS = 'Dregs'` is an **unowned** card: shown on the board, excluded from `championOwner()` and standings (`participants()` includes it for display only). Instant drop-in via `dropIn()`.
  - **seeds** — each boy dealt one of the top-N seeds first, then random.
  - **random** — fully random.
  - `#houseLowToggle` (shown only for seeds/random when rem>0, via `updateDrawModeUI()`): 40th Trip takes the rem lowest-ranked teams; off = random leftovers. In pots mode the dregs always go to 40th Trip.
  - Allocation lives in `drawTeams`; pots branch builds `pots[]` + `dregs` from `bySeed`.
- Seeds (1-48) come from the **official FIFA Men's World Ranking** (inside.fifa.com API). The seed order is baked into `SEED_ORDER` in `app.js` and applied on every load in `normalise()`, so seeds are reference data that can't be lost by a `data.json` merge or auto-update commit. To re-seed (e.g. updated rankings), edit `SEED_ORDER`. (Earlier bug: seeds lived only in `data.json` and got wiped by a merge, so "dregs" picked the last groups instead of the lowest-ranked — fixed by baking them into app.js.)

## Admin vs spectator

- **Admin** = has a GitHub token saved in their browser (`canEdit()` true). Can draw + edit + push.
- **Spectator** = no token. Read-only. `body.spectator` hides admin controls (`.admin-only`).
  The Pages URL **is** the view-only link to send mates — nothing they click changes the sweep.
- Repo config is pre-filled (`DEFAULT_REPO` in app.js), so the admin only pastes a token.

### Token (admin setup)

Fine-grained PAT, scoped to `world-cup-sweep`, **Contents: Read & write**. Create at
https://github.com/settings/personal-access-tokens/new , then Settings tab → paste token →
Save config. Stored only in that browser's localStorage (`wcs_config`), never committed.
Pill shows "Admin · synced" when working. **Daniel has done this already.**

## Auto-updating results

- Source: **openfootball** (`raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`) — public domain, no key.
- A **GitHub Action** (`.github/workflows/update-results.yml`) runs `scripts/update_results.py`
  every ~20 min during 11 Jun–19 Jul 2026 (cron) + manual `workflow_dispatch`.
- The script fills scores, resolves knockout teams, recomputes standings, derives team
  alive/out + champion, and commits `data.json` **only if results changed** (fingerprint
  ignores the sync timestamp to avoid commit spam).
- **Semi-live:** latency = openfootball update lag (minutes to ~hour) + the 20-min cron.
- Manual fallback: the **Teams** tab. Auto-update is authoritative and reconciles on next run.
- After the bot commits, `git pull` before editing locally.

### Run the updater locally

```bash
python3 scripts/update_results.py --dry-run        # preview, no write
python3 scripts/update_results.py                  # fetch live + write data.json
python3 scripts/update_results.py --local FILE      # use a local openfootball json
```

## Data model (`data.json`)

- `meta`: title, subtitle ("Everything But · Last Team Standing"), lastResultSync.
- `teams[]`: `{id, name, group, flag, status}` — status `alive`|`out`. 48 teams.
- `boys[]`: participant names.
- `draw`: `{completed, order[], allocations{}}`. `allocations` keyed by boy name (+ `"40th Trip"`).
- `champion`: team id or null.
- `schedule[]`: 104 matches. `{num, stage, group, date, kickoff, t1, t2, ref1, ref2, s1, s2, p1, p2, status}`.
  - Match numbers: group 1-72, R32 73-88, R16 89-96, QF 97-100, SF 101-102, 3P 103, F 104.
  - Knockout `ref1/ref2` are slot labels ("2A", "3A/B/C/D/F", "W101") until resolved to `t1/t2`.
  - `kickoff` is a **UTC ISO** instant; the frontend renders it in the viewer's chosen zone (default **Australia/Sydney**).

## Key behaviours / conventions

- **Times** default to Sydney (AEST) but each viewer can switch the display zone — see the
  Match Centre timezone picker under Recent additions. DST-safe via `Intl` timeZone.
- **Active tab persists** across refresh (localStorage `wcs_view`); first-time default landing tab is **Match Centre**.
- **Owner tags** appear on teams throughout (group tables, bracket, match centre). On desktop
  they show inline next to the team name; on a phone Match Centre shows them on a dedicated
  owners row instead (see Recent additions).
- **Mobile-first** is the priority (most viewing is on phones).
- Australian English; no em dashes.

## Recent additions

These landed after the original handover was written and are not covered above:

- **Match Centre timezone picker.** Each viewer can switch the display zone between
  Sydney / London / New York; choice persists in `localStorage` (`TZ_KEY = 'wcs_tz'`).
  Zones in `TZS`; helpers `displayZone()`, `displayZoneLabel()`, `setDisplayZone()`.
  Defaults to `Australia/Sydney`. (Supersedes the old "always Sydney" behaviour — kickoffs
  are still stored as UTC ISO and rendered in the chosen zone.)
- **Match Centre owners on mobile.** Owners now render on a dedicated portrait row rather than
  being hidden on phones: `mcOwnerChip(teamId, side)` builds one chip, `mcOwnersHTML(m)` the
  footer row (hidden on desktop where owners show inline, shown on mobile).
- **Match Centre row layout.** Score/time centred on the row (CSS).
- **Trophy image in the header.** `trophy.png` shown via `.trophy-img`; the old inline SVG
  trophy is kept as a hidden fallback.
- **Hide-the-Settings-tab toggle.** Shared flag `DATA.meta.hideSettingsTab` hides the Settings
  tab from the wider group. Logic: `settingsHidden()`, `settingsTabVisible()` (visible if not
  hidden, or the viewer holds a token, or the URL hash opens it), `adminHashOpen()`, toggle
  button `#toggleSettingsTab`, label/note synced by `updateSettingsTab()`. Re-open anytime via
  `#settings` (or `#admin`) on the URL; stays visible on the admin's own browser.
- **Groups card text contained.** CSS fixes so long team names and standings/fixtures text stay
  inside the group card instead of overflowing.

## Team data accuracy

The 48 teams + groups were cross-checked against two sources (Wikipedia 2026 draw + openfootball)
and matched exactly. Any single team is editable directly in `data.json` (`name`/`group`/`flag`).
openfootball name diffs handled in the updater's `NAME_FIX`.

## Known limitations / honest notes

- **"LIVE" in Match Centre is a heuristic** (now within ~2.5h of kickoff, not yet finished) — openfootball gives finished/not-finished, not a true in-play flag.
- **No visual QA done in-browser** during the build (the Claude-in-Chrome extension wasn't connecting). All logic verified via Node VM harness; if something looks off on a phone, check the bracket/match-centre row widths first.
- Group-stage elimination in the updater triggers only once all group matches are played and R32 teams are known (relies on openfootball resolving the bracket).

## Common next tasks (ideas, not committed)

- Add a true live score source if openfootball lag is annoying (football-data.org via the Action — needs a free key as a repo secret).
- Per-team goal totals / a "your live teams today" highlight for each boy.

## To resume

1. `cd "/Users/danielfainsinger/Documents/GitHub/world-cup-sweep" && git pull`
2. Serve locally: `python3 -m http.server 8765` then open `http://localhost:8765`.
3. This file + the auto-memory at
   `~/.claude/projects/-Users-danielfainsinger-Documents-GitHub-experiments/memory/world-cup-sweep.md`
   carry the full context.
