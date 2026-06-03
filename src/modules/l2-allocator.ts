import type { IndexData } from './data-loader'

export interface L2Config {
  stockMinPct: number
  stockMaxPct: number
  lookbackYears: number
  deadZoneLow: number
  deadZoneHigh: number
}

export function computeStockWeight(
  stockData: IndexData,
  bondData: IndexData,
  targetDate: string,
  staticStockWeight: number,
  config: L2Config,
): { stockWeight: number } | null {
  const pe = stockData.getMetric(targetDate)
  if (pe === null) return null
  const ytm = bondData.getMetric(targetDate)
  if (ytm === null) return null

  // Current spread
  const currentSpread = (1 / pe - ytm / 100) * 100

  // Build historical spread sequence
  const [y, m, d] = targetDate.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const endDate = new Date(y!, m! - 1, d!)
  const startDate = new Date(y! - config.lookbackYears, m! - 1, d!)
  const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`

  const peHistory = stockData.getMetricsInRangeRaw(startStr, endStr)
  const ytmHistory = bondData.getMetricsInRangeRaw(startStr, endStr)
  if (peHistory.length < 2 || ytmHistory.length < 2) return null

  // Compute historical spreads (pairwise by index, using shorter length)
  const n = Math.min(peHistory.length, ytmHistory.length)
  const spreads: number[] = []
  for (let i = 0; i < n; i++) {
    const p = peHistory[i]
    const y = ytmHistory[i]
    if (p !== null && y !== null && p > 0) {
      spreads.push((1 / p - y / 100) * 100)
    }
  }
  if (spreads.length < 2) return null

  // Percentile calculation with countEqual/2 correction
  spreads.sort((a, b) => a - b)

  function percentileAt(pct: number): number {
    const idx = (pct / 100) * (spreads.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(lo + 1, spreads.length - 1)
    const frac = idx - lo
    return spreads[lo]! * (1 - frac) + spreads[hi]! * frac
  }

  const deadLow = percentileAt(config.deadZoneLow)
  const deadHigh = percentileAt(config.deadZoneHigh)
  const spreadMin = spreads[0]!
  const spreadMax = spreads[spreads.length - 1]!

  // All spreads equal — no information → don't adjust
  if (spreadMin >= spreadMax) return { stockWeight: staticStockWeight }

  // Three-segment mapping
  let stockWeight: number
  if (currentSpread <= deadLow) {
    stockWeight = config.stockMinPct
  } else if (currentSpread >= deadHigh) {
    if (spreadMax > deadHigh) {
      stockWeight = staticStockWeight + (currentSpread - deadHigh) / (spreadMax - deadHigh) * (config.stockMaxPct - staticStockWeight)
    } else {
      stockWeight = staticStockWeight
    }
  } else {
    stockWeight = staticStockWeight
  }

  return { stockWeight: clamp(stockWeight, config.stockMinPct, config.stockMaxPct) }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
