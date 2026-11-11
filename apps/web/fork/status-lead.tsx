import Script from 'next/script'
import { apiGet } from '../lib/api-server'
import { PUBLIC_REVALIDATE } from '../lib/site'
import { ApiErrorCallout } from '../app/_components/ui'
import { StationMapLoader } from './station-map-loader'
import type { RbmcMapCollection } from './types'

/** A short explainer for surveyors who land here from a shared link (in Portuguese, like its audience). */
const ABOUT_URL = 'https://marotta.dev/pt/blog/rbmc-status-map-for-surveyors'

/**
 * The RBMC station map, leading the public status page on `/` and on every tag page. It refreshes
 * with the page every 60 s. Visits to these pages are counted by Umami; admin pages are not.
 */
export async function StatusLead({ tag }: { tag?: string }) {
  const map = await apiGet<RbmcMapCollection>(`/status/rbmc/map${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`, {
    revalidate: PUBLIC_REVALIDATE,
  })
  return (
    <section className="rbmc-lead" aria-label="Station map">
      {map.ok ? <StationMapLoader stations={map.data} /> : <ApiErrorCallout what="station map" error={map.error} />}
      <p className="rbmc-lead__about">
        <a href={ABOUT_URL} target="_blank" rel="noopener noreferrer">
          O que é este mapa? →
        </a>
      </p>
      <Script src="https://stats.marotta.dev/script.js" data-website-id="8da16d64-a4be-4682-aa6a-f7f274a59731" strategy="afterInteractive" />
    </section>
  )
}
