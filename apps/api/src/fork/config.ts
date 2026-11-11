import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The station monitor's settings, read once. All optional, with safe defaults.

function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function intInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`)
  return n
}

/**
 * Directory holding the IBGE `RBMCPoint.{shp,dbf}` shapefile, the source of truth for stations.
 * Defaults to `apps/api/data/rbmc` (`../../data/rbmc` from this module under `src/` or `dist/`).
 * Bind-mount a directory over it to replace the station list; the sync picks up mtime changes.
 */
export const RBMC_SHAPEFILE_DIR = optionalEnv(
  'RBMC_SHAPEFILE_DIR',
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'rbmc'),
)
export const RBMC_SHAPEFILE_BASENAME = 'RBMCPoint'

/** NTRIP caster sourcetable URL (`GET /`). The public RBMC-IP caster by default. */
export const RBMC_NTRIP_URL = optionalEnv('RBMC_NTRIP_URL', 'http://gps-ntrip.ibge.gov.br:2101/')
try {
  new URL(RBMC_NTRIP_URL)
} catch {
  throw new Error('RBMC_NTRIP_URL must be a valid URL')
}

/** How often the shapefile mtime is polled for changes (an async `fs.stat`, cheap). */
export const RBMC_SYNC_POLL_MS = intInRange('RBMC_SYNC_POLL_MS', 60_000, 5_000, 3_600_000)
