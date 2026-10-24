import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Orca Flow" is a personal build of Orca (with the Flow panel) that installs beside the official
 * app. The installer marks it with `orcaFlavor: "flow"` in the packaged package.json
 * (electron-builder extraMetadata, ORCA_FLOW_BUILD=1). It gets its own userData folder, app name
 * and Windows app id, and never auto-updates from the official Orca release feed.
 */
export const ORCA_FLOW_APP_NAME = 'Orca Flow'
export const ORCA_FLOW_APP_USER_MODEL_ID = 'com.calintz.orcaflow'
export const ORCA_FLOW_USER_DATA_DIR_NAME = 'orca-flow'

let cached: boolean | undefined

export function isOrcaFlowBuild(): boolean {
  if (cached === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
        orcaFlavor?: unknown
      }
      cached = app.isPackaged && pkg.orcaFlavor === 'flow'
    } catch {
      cached = false
    }
  }
  return cached
}
