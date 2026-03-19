import { getAvailableAnalyzers, getDefaultRoots } from '../utils/scanner'

export default defineEventHandler(() => {
  return {
    platform: process.platform,
    defaultRoots: getDefaultRoots(),
    availableAnalyzers: getAvailableAnalyzers()
  }
})
