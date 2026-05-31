import type { IndexData } from './data-loader'

export interface SmartConfig {
  lookbackYears: number
  cheapPercentile: number    // PE below this → cheapMultiplier (default 30)
  cheapMultiplier: number    // default 1.5
  expensivePercentile: number // PE above this → expensiveMultiplier (default 70)
  expensiveMultiplier: number // default 0.5
}

const MIN_MULTIPLIER = 0.1
const MAX_MULTIPLIER = 5.0

export function computeMultiplier(
  data: IndexData,
  targetDate: string,
  config: SmartConfig,
): number {
  const currentMetric = data.getMetric(targetDate)
  if (currentMetric === null) return 1.0

  // Compute lookback window (use local date to avoid timezone issues)
  const [y, m, d] = targetDate.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const endDate = new Date(y!, m! - 1, d!)
  const startDate = new Date(y! - config.lookbackYears, m! - 1, d!)
  const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`

  // Get historical metric values
  const history = data.getMetricsInRange(startStr, endStr)
  if (history.length === 0) return 1.0

  // Compute percentile: fraction of values strictly less than current
  let countBelow = 0
  for (const v of history) {
    if (v < currentMetric) countBelow++
  }
  // For values equal to current, treat as at that percentile
  let countEqual = 0
  for (const v of history) {
    if (v === currentMetric) countEqual++
  }
  const percentile = (countBelow / history.length) * 100

  // Match: cheap → expensive → middle=1.0
  if (percentile <= config.cheapPercentile) {
    return clamp(config.cheapMultiplier, MIN_MULTIPLIER, MAX_MULTIPLIER)
  }
  if (percentile >= config.expensivePercentile) {
    return clamp(config.expensiveMultiplier, MIN_MULTIPLIER, MAX_MULTIPLIER)
  }
  return 1.0
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
