import type { PublicStatusOutcome, TestStatus } from '@sentinel/shared'

/** One RBMC station, sourced from the IBGE `RBMCPoint` shapefile (`SG_RBMC` column). */
export interface RbmcStation {
  /** 4-character station code (`SG_RBMC`), also the NTRIP mountpoint prefix. */
  code: string
  /** The generated monitoring test for this station; null until the first sync links one. */
  test_id: string | null
  /** IBGE station id (`ESTACAO`). */
  station_id: string | null
  uf: string | null
  /** IBGE municipality code (`GEOCODIGO`). */
  geocodigo: string | null
  lat: number | null
  lon: number | null
  /** Geometric altitude as written in the shapefile (`ALTGEOM`, free text). */
  alt_geom: string | null
  /** City / identifier, taken from the NTRIP sourcetable when known. */
  name: string | null
  /** False once the station has disappeared from the shapefile (its test is disabled, not deleted). */
  in_shapefile: boolean
  template_version: number | null
  synced_at: Date | null
}

/** Admin listing: a station joined to its test and live state. */
export interface RbmcStationSummary extends RbmcStation {
  test_name: string | null
  test_enabled: boolean | null
  last_status: TestStatus | null
  last_run_at: string | null
}

export interface RbmcMountpoint {
  mountpoint: string
  format: string
}

/** Public map feature: aggregated data only (`test_state.public_status` and `uptime_daily`). */
export interface RbmcMapFeatureProperties {
  code: string
  name: string | null
  uf: string | null
  test_id: string | null
  status: PublicStatusOutcome
  enabled: boolean
  uptime_pct_30d: number | null
  /** Live mountpoints from the in-process sourcetable cache, present only when the cache is warm. */
  mountpoints?: RbmcMountpoint[]
}

export interface RbmcMapFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: RbmcMapFeatureProperties
}

export interface RbmcMapCollection {
  type: 'FeatureCollection'
  features: RbmcMapFeature[]
}

export type RbmcSyncReason = 'startup' | 'mtime' | 'manual'

export interface RbmcSyncSummary {
  ok: boolean
  reason: RbmcSyncReason
  /** Stations read from the shapefile. */
  stations: number
  created: number
  adopted: number
  updated: number
  disabled: number
  /** Tests re-enabled because their station came back into the shapefile. */
  reenabled: number
  /** Shapefile rows skipped (bad code, bad coordinates, duplicate). */
  skipped: number
  error?: string
}
