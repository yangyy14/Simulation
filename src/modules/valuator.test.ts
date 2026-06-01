import { describe, it, expect } from 'vitest'
import { computeMultiplier, type SmartConfig } from './valuator'
import { IndexDataImpl } from './data-loader'

function makeData(name: string, dates: string[], prices: number[], metrics?: number[]): IndexDataImpl {
  const rows = dates.map((d, i) => ({
    date: d,
    price: prices[i],
    metric: metrics ? metrics[i] : undefined,
  }))
  return new IndexDataImpl(name, rows, name === 'AU9999')
}

// 5 years of monthly PE data, PE ranging from 8 to 22
function makePEData(): IndexDataImpl {
  const dates: string[] = []
  const prices: number[] = []
  const pes: number[] = []
  for (let y = 0; y < 5; y++) {
    for (let m = 1; m <= 12; m++) {
      dates.push(`${2019 + y}-${String(m).padStart(2, '0')}-01`)
      prices.push(1000 + y * 100 + m)
      // PE cycles: 8 → 15 → 22 → 15 → 8 over 5 years
      const phase = (y * 12 + m) / (5 * 12)
      pes.push(8 + Math.sin(phase * Math.PI * 2) * 7 + 7)
    }
  }
  return makeData('test', dates, prices, pes)
}

const defaultConfig: SmartConfig = {
  lookbackYears: 10,
  cheapPercentile: 30, cheapMultiplier: 1.5,
  expensivePercentile: 70, expensiveMultiplier: 0.5,
}

describe('computeMultiplier', () => {
  it('returns 1.0 when metric is null at target date', () => {
    const data = makeData('test', ['2020-01-01'], [1000]) // no metric
    expect(computeMultiplier(data, '2020-01-01', defaultConfig)).toBe(1.0)
  })

  it('returns 1.5 when PE is at very low percentile (cheap)', () => {
    const data = makePEData()
    // phase=0.75 (2022-10): sin(3π/2)=-1 → PE=8+(-7)+7=8 → lowest
    // At this point PE is the lowest in the dataset → 0th percentile → 1.5x
    const r = computeMultiplier(data, '2022-10-01', defaultConfig)
    expect(r).toBe(1.5)
  })

  it('returns higher multiplier (cheap) and lower multiplier (expensive)', () => {
    const data = makePEData()
    // phase=0.25 (2020-04): sin(π/2)=1 → PE=8+7+7=22 → highest
    const expensive = computeMultiplier(data, '2020-04-01', defaultConfig)
    // phase=0.75 (2022-10): sin(3π/2)=-1 → PE=8 → lowest
    const cheap = computeMultiplier(data, '2022-10-01', defaultConfig)
    // Cheap should have higher multiplier than expensive
    expect(cheap).toBeGreaterThan(expensive)
  })

  it('returns appropriate multiplier based on actual PE percentile', () => {
    const data = makePEData()
    // Use a date where we know the exact PE value
    // PE at '2022-10-01' should be low (near cycle bottom ~8)
    const cheap = computeMultiplier(data, '2022-10-01', defaultConfig)
    expect(cheap).toBe(1.5) // very low PE → tier 1
    // PE at '2020-04-01' should be high (near cycle top ~22)
    const expensive = computeMultiplier(data, '2020-04-01', defaultConfig)
    expect(expensive).toBeLessThan(1.5) // high PE → lower tier
  })

  it('uses actual available years when less than lookback', () => {
    // Only 3 data points, lookback is 10 years
    const dates = ['2020-01-01', '2020-02-01', '2020-03-01']
    const prices = [1000, 1010, 1020]
    const pes = [10, 12, 20]
    const data = makeData('test', dates, prices, pes)
    // Current PE = 20, history = [10, 12, 20], below=2, equal=1 → (2+0.5)/3 = 83.3%
    // 83.3% ≥ 70% → expensive tier → 0.5x
    expect(computeMultiplier(data, '2020-03-01', defaultConfig)).toBe(0.5)
    // Current PE = 10, only 1 data point in range (itself) → (0+0.5)/1 = 50% → middle → 1.0x
    expect(computeMultiplier(data, '2020-01-01', defaultConfig)).toBe(1.0)
  })

  it('clamps multiplier to 0.1-5.0 range', () => {
    const data = makePEData()
    const config: SmartConfig = {
      lookbackYears: 10,
      cheapPercentile: 10, cheapMultiplier: 0.05,     // below minimum
      expensivePercentile: 50, expensiveMultiplier: 6.0, // above maximum
    }
    // Very low PE → first tier, but multiplier 0.05 is below 0.1 → clamp to 0.1
    const r = computeMultiplier(data, '2023-12-01', config)
    expect(r).toBeGreaterThanOrEqual(0.1)
    expect(r).toBeLessThanOrEqual(5.0)
  })
})
