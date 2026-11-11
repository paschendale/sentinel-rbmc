import type { FastifyInstance } from 'fastify'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/** The station tools. They forward to the station routes as the caller, like upstream's tools. */
export function registerRbmcTools(server: McpServer, app: FastifyInstance, authorization: string): void {
  async function forward(method: 'GET' | 'POST', url: string): Promise<CallToolResult> {
    const res = await app.inject({ method, url, headers: { authorization } })
    const text = res.body || JSON.stringify({ ok: res.statusCode < 400 })
    return { content: [{ type: 'text', text }], ...(res.statusCode >= 400 ? { isError: true } : {}) }
  }

  server.registerTool(
    'list_rbmc_stations',
    {
      description:
        'List every IBGE RBMC GNSS station known to this instance, with its monitoring test, coordinates, ' +
        'live state (last_status, last_run_at) and whether it is still in the shapefile. The RBMCPoint ' +
        'shapefile (SG_RBMC column) is the source of truth; one generated test per station (tag "rbmc", ' +
        'name "RBMC - CODE - City") checks that a mountpoint starting with CODE is listed in the RBMC-IP ' +
        'NTRIP sourcetable.',
      inputSchema: {},
    },
    async () => forward('GET', '/rbmc'),
  )

  server.registerTool(
    'sync_rbmc_stations',
    {
      description:
        'Re-read the RBMC shapefile now and reconcile the station tests: create tests for new stations, ' +
        'adopt and rename existing "RBMC - CODE0 - City" tests, rewrite generated code when the template ' +
        'changed, and pause (never delete) tests of stations removed from the shapefile. It runs on its own ' +
        'at startup and whenever the shapefile changes; call it after replacing the shapefile to apply it ' +
        'at once. Do not create, rename or delete station tests by hand: the sync owns their name and code; ' +
        'use update_test only to change enabled.',
      inputSchema: {},
    },
    async () => forward('POST', '/rbmc/sync'),
  )
}
