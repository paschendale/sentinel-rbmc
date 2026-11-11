import type { FastifyInstance } from 'fastify'
import { cachedReply } from '../routes/public-cache.js'
import { RBMC_NTRIP_URL } from './config.js'
import { ntripSourcetableCache } from './ctx-ntrip.js'
import { buildRbmcMapCollection, mountpointsByCode } from './map.js'
import { listStations, listStationsForMap } from './queries.js'
import { syncRbmcStations } from './sync.js'

const MAX_TAG_LENGTH = 100

/** Station routes. `/rbmc*` needs a token (the global hook); `/status/rbmc/*` is public. */
export async function rbmcRoutes(app: FastifyInstance): Promise<void> {
  // GET /rbmc: every station with its linked test and live state.
  app.get('/rbmc', async (_req, reply) => {
    return reply.send(await listStations())
  })

  // POST /rbmc/sync: re-read the shapefile now (same as the mtime poller and startup).
  app.post('/rbmc/sync', async (_req, reply) => {
    const summary = await syncRbmcStations({ reason: 'manual' })
    return reply.status(summary.ok ? 200 : 503).send(summary)
  })

  // GET /status/rbmc/map: public GeoJSON of the stations, from rbmc_stations, test_state and
  // uptime_daily only. Live mountpoints come from the sourcetable cache when it is warm.
  // ?tag= limits it to stations whose test carries the tag, like GET /status/tag/:tag.
  app.get<{ Querystring: { tag?: string } }>('/status/rbmc/map', async (req, reply) => {
    const tag = req.query.tag
    if (tag !== undefined && (typeof tag !== 'string' || tag.length === 0 || tag.length > MAX_TAG_LENGTH)) {
      return reply.status(400).send({ error: `tag must be 1 to ${MAX_TAG_LENGTH} characters` })
    }
    const r = await cachedReply(`rbmc-map:${tag ?? ''}`, async () => ({
      status: 200,
      body: buildRbmcMapCollection(await listStationsForMap(tag), mountpointsByCode(ntripSourcetableCache.peek(RBMC_NTRIP_URL))),
    }))
    reply.header('Cache-Control', 'public, max-age=60')
    return reply.status(r.status).send(r.body)
  })
}
