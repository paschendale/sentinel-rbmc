import type { PublicStatusOutcome } from '@sentinel/shared'

// The public map's GeoJSON, as GET /status/rbmc/map returns it (apps/api/src/fork/types.ts).

export interface RbmcMountpoint {
  mountpoint: string
  format: string
}

export interface RbmcMapFeatureProperties {
  code: string
  name: string | null
  uf: string | null
  test_id: string | null
  status: PublicStatusOutcome
  enabled: boolean
  uptime_pct_30d: number | null
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
