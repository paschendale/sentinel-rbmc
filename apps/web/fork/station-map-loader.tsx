'use client'

import dynamic from 'next/dynamic'
import type { RbmcMapCollection } from './types'

/** MapLibre touches window and WebGL: load it in the browser only. */
const StationMap = dynamic(() => import('./station-map').then((m) => m.StationMap), {
  ssr: false,
  loading: () => <div className="rbmc-map rbmc-map--loading" aria-busy="true" />,
})

export function StationMapLoader({ stations }: { stations: RbmcMapCollection }) {
  return <StationMap stations={stations} />
}
