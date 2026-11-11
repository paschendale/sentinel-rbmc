import type { ForkExtension } from '../extensions.js'
import { ntripCtx } from './ctx-ntrip.js'
import { registerRbmcTools } from './mcp-tools.js'
import { rbmcRoutes } from './routes.js'
import { startRbmcSync, stopRbmcSync } from './sync.js'

/**
 * The RBMC station monitor: IBGE's RBMC GNSS stations, one test per station, kept in step with
 * the RBMCPoint shapefile, and a station map on the public status page. See docs/fork/RBMC.md.
 */
export const fork: ForkExtension = {
  routes: rbmcRoutes,
  ctx: ntripCtx,
  mcpTools: registerRbmcTools,
  mcpInstructions: [
    'ctx.ntrip.sourcetable(url?) returns the STR rows of an NTRIP caster sourcetable as objects ' +
      '{mountpoint, identifier, format, formatDetails, navSystem, network, country, lat, lon, generator}; ' +
      'url defaults to the RBMC-IP caster, and every test shares one copy per 60 s.',
    "This instance monitors the real-time stations of IBGE's RBMC (Rede Brasileira de Monitoramento " +
      'Contínuo dos Sistemas GNSS) through the RBMC-IP NTRIP caster sourcetable. The station list comes ' +
      'from the IBGE RBMCPoint shapefile (SG_RBMC column), which operators update by replacing the file. ' +
      'A sync job keeps exactly one test per station (tag "rbmc", name "RBMC - CODE - City", generated ' +
      'code calling ctx.ntrip.sourcetable()), adopts existing hand-made tests and pauses tests of removed ' +
      'stations. Use list_rbmc_stations to see the stations with coordinates and state, and ' +
      'sync_rbmc_stations after the shapefile is replaced. Never create, rename or delete station tests ' +
      'by hand: the sync overwrites their name and code; only enabled is yours. The public status page ' +
      'shows the stations on a map.',
  ],
  start: startRbmcSync,
  stop: stopRbmcSync,
}
