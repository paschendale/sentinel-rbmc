'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, addProtocol, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol as PmtilesProtocol } from 'pmtiles'
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps'
import { DefinitionGrid, StatusIndicator } from '../app/_components/ui'
import { KIND_LABELS, outcomeKind, type StateKind } from '../lib/states'
import type { RbmcMapCollection, RbmcMapFeatureProperties } from './types'
import './station-map.css'

// MapLibre finds its worker relative to its own module, which a bundler breaks. The two files
// it needs ship in public/maplibre/ (copied from maplibre-gl 6.9.1; update them with the package).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
// `pmtiles://` sources: register the protocol once per page load.
addProtocol('pmtiles', new PmtilesProtocol().tile)

/**
 * A Brazil-only Protomaps extract in an object storage bucket with CORS enabled (Protomaps' own
 * buckets send no CORS headers, so browsers cannot range-read them).
 */
const PMTILES_URL = 'pmtiles://https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr6tkdct0hgi/b/brazil-tiles/o/brazil.pmtiles'
const BASEMAP_SOURCE = 'protomaps-basemap'
const STATIONS_SOURCE = 'rbmc-stations'
const STATIONS_LAYER = 'rbmc-stations'
const SELECTED_LAYER = 'rbmc-selected'

/** Brazil, with some slack for the offshore stations. */
const BRAZIL_BOUNDS: [[number, number], [number, number]] = [[-75, -35], [-33, 6]]

type Theme = 'light' | 'dark'
type MarkKind = Extract<StateKind, 'operational' | 'degraded' | 'outage' | 'unknown' | 'paused'>

const KIND_ORDER: readonly MarkKind[] = ['outage', 'degraded', 'operational', 'unknown', 'paused']
/** Drawn last = on top: Outage over Degraded over the rest. */
const SEVERITY: Record<MarkKind, number> = { paused: 0, unknown: 1, operational: 2, degraded: 3, outage: 4 }
const KIND_COLOR_TOKEN: Record<MarkKind, string> = {
  operational: '--operational-solid',
  degraded: '--degraded-solid',
  outage: '--outage-solid',
  unknown: '--unknown-solid',
  paused: '--unknown-solid',
}

function kindOf(p: RbmcMapFeatureProperties): MarkKind {
  if (!p.enabled) return 'paused'
  return outcomeKind(p.status) as MarkKind
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function currentTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme')
  if (set === 'light' || set === 'dark') return set
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Follows the Light / Dark / System switch and the system setting. */
function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => {
    const update = () => setTheme(currentTheme())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [])
  return theme
}

/** Protomaps flavours: dark as is, and grayscale for light so the map stays as neutral as the page. */
const FLAVOR: Record<Theme, string> = { dark: 'dark', light: 'grayscale' }

function basemapStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${FLAVOR[theme]}`,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        url: PMTILES_URL,
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: protomapsLayers(BASEMAP_SOURCE, namedFlavor(FLAVOR[theme]), { lang: 'pt' }),
  } as StyleSpecification
}

/** When the basemap cannot load: plain ground in the page colour, stations still drawn. */
function fallbackStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': token('--surface') } }] }
}

/**
 * The state shapes of the design system, drawn for the map: disc, triangle, square, and a ring
 * for No data and a bar for Paused. Colours come from the tokens of the current theme.
 */
function markImage(kind: MarkKind): ImageData {
  const ratio = 2
  const size = 16 * ratio
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!
  const c = size / 2
  const r = 5.5 * ratio
  g.fillStyle = token(KIND_COLOR_TOKEN[kind])
  g.strokeStyle = token('--bg')
  g.lineWidth = 1.5 * ratio
  g.beginPath()
  if (kind === 'operational') {
    g.arc(c, c, r, 0, Math.PI * 2)
  } else if (kind === 'degraded') {
    g.moveTo(c, c - r - ratio)
    g.lineTo(c + r + ratio, c + r)
    g.lineTo(c - r - ratio, c + r)
    g.closePath()
  } else if (kind === 'outage') {
    g.rect(c - r, c - r, 2 * r, 2 * r)
  } else if (kind === 'paused') {
    g.rect(c - r, c - 1.5 * ratio, 2 * r, 3 * ratio)
  } else {
    g.arc(c, c, r - ratio, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = token(KIND_COLOR_TOKEN[kind])
    g.lineWidth = 2 * ratio
    g.stroke()
    return g.getImageData(0, 0, size, size)
  }
  g.stroke()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

interface StationGeoJson {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { code: string; kind: MarkKind; severity: number }
  }>
}

/** MapLibre's own GeoJSON type (from @types/geojson, which the web app does not depend on). */
type MapGeoJson = Parameters<GeoJSONSource['setData']>[0]

function toGeoJson(stations: RbmcMapCollection): StationGeoJson {
  return {
    type: 'FeatureCollection',
    features: stations.features.map((f) => {
      const kind = kindOf(f.properties)
      return { type: 'Feature', geometry: f.geometry, properties: { code: f.properties.code, kind, severity: SEVERITY[kind] } }
    }),
  }
}

function addStationLayers(map: MapLibreMap, data: StationGeoJson, selected: string | null): void {
  for (const kind of KIND_ORDER) {
    if (!map.hasImage(kind)) map.addImage(kind, markImage(kind), { pixelRatio: 2 })
  }
  if (!map.getSource(STATIONS_SOURCE)) map.addSource(STATIONS_SOURCE, { type: 'geojson', data: data as MapGeoJson })
  if (!map.getLayer(SELECTED_LAYER)) {
    map.addLayer({
      id: SELECTED_LAYER,
      type: 'circle',
      source: STATIONS_SOURCE,
      filter: ['==', ['get', 'code'], selected ?? ''],
      paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2, 'circle-stroke-color': token('--fg') },
    })
  }
  if (!map.getLayer(STATIONS_LAYER)) {
    map.addLayer({
      id: STATIONS_LAYER,
      type: 'symbol',
      source: STATIONS_SOURCE,
      layout: {
        'icon-image': ['get', 'kind'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'severity'],
      },
    })
  }
}

export function StationMap({ stations }: { stations: RbmcMapCollection }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const theme = useTheme()
  const [selected, setSelected] = useState<string | null>(null)
  const geojson = useMemo(() => toGeoJson(stations), [stations])
  // Read inside map events, which keep the values from when they were attached.
  const geojsonRef = useRef(geojson)
  const selectedRef = useRef(selected)
  geojsonRef.current = geojson
  selectedRef.current = selected

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibreMap({
      container: container.current,
      style: basemapStyle(currentTheme()),
      bounds: BRAZIL_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('style.load', () => addStationLayers(map, geojsonRef.current, selectedRef.current))
    let fellBack = false
    map.on('error', (e) => {
      // A basemap that cannot load (tiles, glyphs, sprite) should not hide the stations.
      const source = (e as { sourceId?: string }).sourceId
      if (!fellBack && (source === BASEMAP_SOURCE || !map.isStyleLoaded())) {
        fellBack = true
        map.setStyle(fallbackStyle())
      }
    })
    map.on('click', STATIONS_LAYER, (e) => {
      const code = e.features?.[0]?.properties?.['code']
      if (typeof code === 'string') setSelected(code)
    })
    map.on('click', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: [STATIONS_LAYER] }).length === 0) setSelected(null)
    })
    map.on('mouseenter', STATIONS_LAYER, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', STATIONS_LAYER, () => (map.getCanvas().style.cursor = ''))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // New data on every page refresh.
  useEffect(() => {
    const source = mapRef.current?.getSource(STATIONS_SOURCE) as GeoJSONSource | undefined
    source?.setData(geojson as MapGeoJson)
  }, [geojson])

  // The basemap and the mark colours follow the theme.
  const firstTheme = useRef(true)
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false
      return
    }
    mapRef.current?.setStyle(basemapStyle(theme))
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(SELECTED_LAYER)) map.setFilter(SELECTED_LAYER, ['==', ['get', 'code'], selected ?? ''])
  }, [selected])

  const counts = useMemo(() => {
    const out = new Map<MarkKind, number>()
    for (const f of stations.features) {
      const k = kindOf(f.properties)
      out.set(k, (out.get(k) ?? 0) + 1)
    }
    return out
  }, [stations])

  const station = selected ? stations.features.find((f) => f.properties.code === selected)?.properties : undefined

  return (
    <div className="rbmc-lead__body">
      <div className="rbmc-map">
        <div ref={container} className="rbmc-map__canvas" />
        {station && <StationPanel station={station} onClose={() => setSelected(null)} />}
      </div>
      <div className="rbmc-legend" aria-label="Stations by state">
        <span className="rbmc-legend__total">{stations.features.length} stations</span>
        {KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => (
          <StatusIndicator key={k} kind={k} label={`${KIND_LABELS[k]} ${counts.get(k)}`} />
        ))}
      </div>
    </div>
  )
}

function StationPanel({ station, onClose }: { station: RbmcMapFeatureProperties; onClose: () => void }) {
  const kind = kindOf(station)
  const place = [station.name, station.uf].filter(Boolean).join(', ')
  return (
    <div className="sn-card rbmc-map__panel" role="dialog" aria-label={`Station ${station.code}`}>
      <div className="rbmc-map__panel-head">
        <div>
          <div className="rbmc-map__code">{station.code}</div>
          {place && <div className="rbmc-map__place">{place}</div>}
        </div>
        <button type="button" className="sn-btn sn-btn--ghost sn-btn--sm" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <StatusIndicator kind={kind} />
      <DefinitionGrid
        items={[
          { term: 'Uptime 30 d', value: station.uptime_pct_30d === null ? 'No data' : `${station.uptime_pct_30d}%` },
          {
            term: 'Mountpoints',
            value: station.mountpoints?.length ? station.mountpoints.map((m) => `${m.mountpoint} (${m.format})`).join(', ') : 'None listed now',
          },
        ]}
      />
      {station.test_id && (
        <a className="rbmc-map__link" href={`/status/tests/${encodeURIComponent(station.test_id)}`}>
          Check history →
        </a>
      )}
    </div>
  )
}
