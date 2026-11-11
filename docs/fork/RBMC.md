# RBMC station monitor

This repository is a fork of [Sentinel](https://github.com/territorial-dev/sentinel) that monitors the real-time stations of IBGE's **RBMC** (Rede Brasileira de Monitoramento Contínuo dos Sistemas GNSS). It keeps everything upstream does (tests, tags, channels, incidents, the status page, MCP) and adds a station layer through upstream's fork slots, so pulling a new Sentinel release is a plain merge. Everything not listed here behaves as upstream; see upstream's [forking guide](../FORKING.md).

## What is monitored

IBGE streams each station over NTRIP from the public **RBMC-IP** caster (`gps-ntrip.ibge.gov.br:2101`). The caster's sourcetable (`GET /`) lists one `STR` line per live mountpoint: the station's 4-letter code plus a suffix, for example `VICO0` (RTCM 3.2/3.3 MSM) and, for some stations, `VICO1` (legacy RTCM 3.0).

Each station has exactly one test. It passes when at least one `RBMC-IP` mountpoint starting with the station code is listed. Every mountpoint found gets a passing assertion naming its format and receiver, for example `VICO0 is online (RTCM 3.2 GPS+GLO+GAL+BDS+SBAS via TRIMBLE NETR9)`; a missing station fails with `No mountpoint starting with CODE in the RBMC-IP sourcetable`.

Defaults: 15-minute schedule, 10 s timeout, 1 retry, failure threshold 3, 24 h cooldown, tag `rbmc`. The instance runs with `STATUS_WINDOW_MINUTES=60` (upstream's [status window](../guide/status-and-incidents.md#the-status-window)): a station is in Outage only after an hour of failing, and back to Operational only after an hour of passing, so a short blip shows as Degraded and pages nobody.

## The shapefile is the source of truth

The station list is IBGE's *RBMC/GNSS Permanente* shapefile, `RBMCPoint.{shp,shx,dbf,prj,cst}`, shipped in `apps/api/data/rbmc/` and baked into the image. Only `.shp` (points) and `.dbf` (attributes, latin-1) are read. `SG_RBMC` is the station code; `ESTACAO`, `UF`, `GEOCODIGO`, `ALTGEOM` and the coordinates (SIRGAS 2000, EPSG:4674) are stored with it.

**To change the station list, replace the files.** Nobody edits station rows or station tests by hand:

- bind-mount a directory with the five files over the image's `apps/api/data/rbmc`, or point `RBMC_SHAPEFILE_DIR` at one;
- the API polls the files' modification time every `RBMC_SYNC_POLL_MS` (default 60 s) and syncs once it has been stable for two polls;
- to apply at once, call `POST /rbmc/sync` or the MCP tool `sync_rbmc_stations`.

The reader is hand-written and has no dependency (`apps/api/src/fork/shapefile.ts`). A missing or corrupt file fails the sync and is logged; a bad row is skipped and logged. The process never stops because of the shapefile.

## The sync

`apps/api/src/fork/sync.ts` runs in the background after the API starts listening, on every shapefile change, and on demand. Per station:

| Situation | Action |
| --- | --- |
| Linked to a test that exists | Left alone; name and code rewritten only if the template version changed |
| Not linked, but a test named `RBMC - CODE0 - City`, `RBMC - CODE - City` or `RBMC - CODE1 - City` exists | **Adopted**: renamed to `RBMC - CODE - City`, code replaced, linked; history kept. Other matches for the code are paused |
| Nothing to adopt | **Created** with the defaults; the city comes from the sourcetable when the caster answers |
| Gone from the shapefile | Flagged `in_shapefile = false`, test paused, off the map |
| Back in the shapefile | Test re-enabled |

The sync never deletes a test, never changes the schedule or timeout, and never changes `enabled` on a linked station that is present: pausing a station test by hand sticks. All writes happen in one transaction; scheduler events fire after commit.

Generated code lives in `apps/api/src/fork/template.ts`. Bump `RBMC_TEMPLATE_VERSION` when it changes and the next sync rewrites every station test.

## What the fork adds

Everything is in the fork slots and in new files:

| Piece | Where |
| --- | --- |
| The extension (routes, `ctx`, MCP tools and instructions, sync start and stop) | `apps/api/src/fork/extension.ts` |
| `ctx.ntrip.sourcetable(url?)`: parsed `STR` rows, one shared 60 s cache, failures never cached | `apps/api/src/fork/ctx-ntrip.ts`, `ntrip-sourcetable.ts` |
| Table `rbmc_stations` | migration `apps/api/src/db/migrations/900_rbmc_stations.sql` |
| `GET /rbmc` (token): every station with its test and live state | `apps/api/src/fork/routes.ts` |
| `POST /rbmc/sync` (token): sync now; 200 with a summary, 503 when the shapefile cannot be read | same |
| `GET /status/rbmc/map` (public, cached 30 s): GeoJSON of the stations from `rbmc_stations`, `test_state` and `uptime_daily` only, plus live mountpoints when the sourcetable cache is warm; `?tag=` limits it to a tag | same |
| MCP tools `list_rbmc_stations` and `sync_rbmc_stations`, and two instruction paragraphs | `apps/api/src/fork/mcp-tools.ts`, `extension.ts` |
| The station map leading the public status page on `/` and on tag pages, the "O que é este mapa?" link, and Umami visit counting on those pages | `apps/web/fork/status-lead.tsx`, `station-map.tsx` |
| MapLibre's worker files (pinned to `maplibre-gl` 6.9.1; copy them again when upgrading) | `apps/web/public/maplibre/` |

The map draws each station with the design system's state shapes and colours (disc, triangle, square; ring for No data, bar for Paused), follows the Light / Dark / System switch, and opens a panel with the station's state, 30-day uptime, live mountpoints and a link to its check page. The basemap is a Brazil-only Protomaps extract in an object storage bucket with CORS enabled; if it cannot load, the stations are drawn on plain ground.

## Settings (all optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `RBMC_SHAPEFILE_DIR` | `apps/api/data/rbmc` | Directory with `RBMCPoint.shp` and `.dbf` |
| `RBMC_NTRIP_URL` | `http://gps-ntrip.ibge.gov.br:2101/` | Sourcetable used by `ctx.ntrip.sourcetable()` without a URL, and by the sync for city names |
| `RBMC_SYNC_POLL_MS` | `60000` | Shapefile poll interval, 5 s to 1 h |
| `STATUS_WINDOW_MINUTES` | `0` upstream; `60` on this instance | Upstream's status window |

## Updating from upstream

Run the **Sync upstream** workflow (Actions tab), optionally with a release tag. It merges upstream into a branch, runs the typecheck and the tests, and opens a pull request that says whether they passed or which files conflict. Merge it and the **Image** workflow publishes `paschendale/sentinel-rbmc:latest`. Conflicts, when there are any, are in `apps/web/package.json` and `pnpm-lock.yaml` (the map libraries): keep both sides and run `pnpm install`.

From a terminal instead:

```bash
git fetch upstream
git merge upstream/main          # or a tag: git merge v1.32.0
pnpm install && pnpm -r typecheck && pnpm --filter @sentinel/api test
```

## Build and deployment

The database of the instance that ran the old `rbmc` branch needed one change before its first start on this fork: [switch-to-fork.sql](switch-to-fork.sql) renames that branch's migration records to their current names, so no migration runs twice. A new database needs nothing.


The **Image** workflow builds the full image from `main` on every push and publishes `paschendale/sentinel-rbmc:latest` and `:sha-<commit>`. The deployment (`disbelief/sentinel-rbmc` in the paschendale.net repository) tracks `latest`.
