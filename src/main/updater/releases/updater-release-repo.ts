import { MAIN_RELEASE_REPO } from '../../../shared/updater/release-channel'
import { isOrcaFlowBuild } from '../../startup/orca-flow-build'

// Orca Flow updates from its fork's releases, whose tags read `orca-flow-v<version>`.
const ORCA_FLOW_RELEASE_REPO = 'calintz100/orca'

export function getUpdateReleaseRepo(): string {
  return isOrcaFlowBuild() ? ORCA_FLOW_RELEASE_REPO : MAIN_RELEASE_REPO
}

export function getLatestReleaseDownloadUrl(): string {
  return `https://github.com/${getUpdateReleaseRepo()}/releases/latest/download`
}

export function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}
