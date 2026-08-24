# Dopamine tracker

Menu bar app for logging activities in plain English and tracking a daily
"junk vs depth" ratio, similar in spirit to calorie/macro tracking.

## Setup (on your Mac)

```bash
npm install
npm run tauri dev
```

First run will also compile the Rust side, which needs the Tauri
prerequisites installed: https://tauri.app/start/prerequisites/

The Rust tray/notification code in `src-tauri/src/lib.rs` was written
against the documented Tauri v2 API but **not compiled** in the sandbox
this was built in (no Rust toolchain, no macOS). Run `cargo check` from
`src-tauri/` first thing — Tauri's plugin APIs move fast enough that
something may have drifted since this was written.

## What's real vs. stubbed

**Fully implemented and typechecked** (`npx tsc --noEmit` passes clean):
- `src/lib/parser.ts` — rule-based free text parser. Verified against your
  original example sentences ("read 20 mins of book", "watched 2h movie",
  "listened around 10 songs right now", "insta surfed 30mins") — all four
  parse correctly with high confidence.
- `src/lib/scoring.ts` — hit/depth scoring, daily aggregation, band logic
- `src/lib/rollingWindow.ts` — 45-min nudge trigger with 30-min cooldown
- `src/lib/db.ts` — SQLite schema, seeding, CRUD (needs `tauri dev` to
  actually run — the SQL plugin only works inside the Tauri runtime)
- `src/lib/taxonomy.ts` — the 11 default activity categories and rates
- React components in `src/components/` — QuickAdd, TodaySummary,
  WeeklyChart, RecentEntries, wired together in `App.tsx`

**Needs your attention before this is a real app:**
- `src/lib/llmFallback.ts` — calls the Anthropic API directly with a key
  read from `VITE_ANTHROPIC_API_KEY`. That's a placeholder for local dev
  only. Before shipping, wire this to macOS Keychain (a small Rust
  `#[tauri::command]` that shells out to `security find-generic-password`
  or uses a keychain crate is the usual approach) — never ship a raw env
  var or localStorage key.
- Settings screen (editing hit/depth rates) — the `db.ts` functions
  (`updateActivityTypeRates`, `resetActivityTypeRate`) exist, but there's
  no UI for them yet. The "Settings" button in the popover is currently a
  dead click.
- App icon (`src-tauri/icons/icon.*`) is still the default Tauri icon —
  only the tray icons (`src-tauri/icons/tray-states/`) use the dopamine
  molecule design.
- The three tray icon PNGs were rasterized from SVG in this sandbox with
  `rsvg-convert` — check they look crisp at actual menu bar size on a
  real Retina display before considering them final.

## Project structure

```
src/
  lib/
    types.ts          shared types, mirrors the SQLite schema
    taxonomy.ts        default activity categories + hit/depth rates
    parser.ts           rule-based text -> {activity, duration}
    llmFallback.ts       Claude API fallback when rules can't parse it
    scoring.ts           hit/depth math, daily aggregation, color bands
    rollingWindow.ts     45-min nudge trigger logic
    db.ts                SQLite layer (tauri-plugin-sql)
    logPipeline.ts        orchestrates parse -> confirm? -> save -> nudge
  components/          QuickAdd, TodaySummary, WeeklyChart, RecentEntries
  App.tsx              wires it all together, syncs the tray icon color
src-tauri/
  src/lib.rs           tray icon, popover window toggle, notifications
  icons/tray-states/    green/amber/red dopamine molecule icons (+ .svg source)
```
