import { fetch } from 'undici'
import type { ForkCtxRun } from '../extensions.js'
import { RBMC_NTRIP_URL } from './config.js'
import { NTRIP_HEADERS, NtripRequestError, createSourcetableCache, type NtripStreamRow } from './ntrip-sourcetable.js'

/** Sourcetable downloads have their own limit, so a hung caster cannot hold a run slot. */
const NTRIP_FETCH_TIMEOUT_MS = 10_000
const NTRIP_CACHE_TTL_MS = 60_000
/** The RBMC-IP table is about 30 KB; anything far larger is not a sourcetable. */
const NTRIP_MAX_BYTES = 2 * 1024 * 1024

async function fetchSourcetable(url: string): Promise<string> {
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(url, { method: 'GET', headers: { ...NTRIP_HEADERS }, signal: AbortSignal.timeout(NTRIP_FETCH_TIMEOUT_MS) })
  } catch (err) {
    throw new NtripRequestError(
      'NTRIP_FETCH_ERROR',
      `Sourcetable request failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      url,
      err instanceof Error ? { cause: err } : undefined,
    )
  }
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {})
    throw new NtripRequestError('NTRIP_FETCH_ERROR', `Sourcetable request for ${url} returned HTTP ${res.status}`, url)
  }
  const chunks: Uint8Array[] = []
  let size = 0
  if (res.body) {
    for await (const chunk of res.body) {
      size += chunk.byteLength
      if (size > NTRIP_MAX_BYTES) {
        await res.body.cancel().catch(() => {})
        throw new NtripRequestError('NTRIP_FETCH_ERROR', `Sourcetable from ${url} is larger than ${NTRIP_MAX_BYTES} bytes`, url)
      }
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * One process-wide sourcetable cache shared by every test's `ctx.ntrip`: about 157 station tests
 * read the same table, so a burst of downloads becomes one per minute. The public map route reads
 * it too (`peek`, never fetching).
 */
export const ntripSourcetableCache = createSourcetableCache({ ttlMs: NTRIP_CACHE_TTL_MS, fetchText: fetchSourcetable })

/** `ctx.ntrip` for one run. */
export function ntripCtx(run: ForkCtxRun): { ntrip: { sourcetable(url?: string): Promise<ReadonlyArray<NtripStreamRow>> } } {
  return {
    ntrip: {
      async sourcetable(url = RBMC_NTRIP_URL) {
        run.signal.throwIfAborted()
        const startMs = Date.now()
        const { rows, cached } = await ntripSourcetableCache.get(url)
        const durationMs = Date.now() - startMs
        run.log.info(
          { event: 'test.ntrip', url, rows: rows.length, cached, duration_ms: durationMs },
          `NTRIP sourcetable ${url} -> ${rows.length} streams (${cached ? 'cached' : 'fetched'}, ${durationMs}ms)`,
        )
        return rows
      },
    },
  }
}
