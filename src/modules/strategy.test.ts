import { describe, it, expect } from 'vitest'
import {
  generateInvestDates,
  validateStrategy,
  runSimulation,
  type Strategy,
  type Segment,
} from './strategy'
import { IndexDataImpl, type IndexData } from './data-loader'
import type { SmartConfig } from './valuator'

function makeDateSeries(name: string, startDate: string, count: number, basePrice = 1000, step = 2): IndexData {
  const pad = (n: number) => String(n).padStart(2, '0')
  const rows: { date: string; price: number }[] = []
  const start = new Date(startDate)
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    rows.push({ date: ds, price: basePrice + i * step })
  }
  return new IndexDataImpl(name, rows)
}

// 6 months of daily data: Jan-Jun 2020
const series = makeDateSeries('沪深300全收益', '2020-01-01', 182, 1000, 1)
const priceMap = new Map<string, IndexData>()
priceMap.set('沪深300全收益', series)

describe('generateInvestDates', () => {
  it('generates monthly dates', () => {
    const seg: Segment = {
      indexName: 'test',
      frequency: 'monthly',
      day: 1,
      amount: 1000,
      startDate: '2020-01-01',
      endDate: '2020-03-15',
    }
    const dates = generateInvestDates(seg)
    expect(dates).toEqual(['2020-01-01', '2020-02-01', '2020-03-01'])
  })

  it('generates weekly dates (Monday)', () => {
    const seg: Segment = {
      indexName: 'test',
      frequency: 'weekly',
      day: 1, // Monday
      amount: 1000,
      startDate: '2020-01-01', // Wednesday
      endDate: '2020-01-20',
    }
    const dates = generateInvestDates(seg)
    // First Monday after 2020-01-01 is 2020-01-06
    expect(dates[0]).toBe('2020-01-06')
    expect(dates.length).toBe(3) // Jan 6, 13, 20
  })
})

describe('validateStrategy', () => {
  const available = ['沪深300全收益']

  it('returns null for valid strategy', () => {
    const strat: Strategy = {
      segments: [
        { indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000, startDate: '2020-01-01', endDate: '2020-06-01' },
      ],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toBeNull()
  })

  it('returns null for empty segments', () => {
    const strat: Strategy = { segments: [], fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 }, evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' } }
    expect(validateStrategy(strat, available)).toBeNull()
  })

  it('rejects unknown index', () => {
    const strat: Strategy = {
      segments: [{ indexName: 'Unknown', frequency: 'monthly', day: 1, amount: 1000, startDate: '2020-01-01', endDate: '2020-06-01' }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toContain('不可用')
  })

  it('rejects amount <= 0', () => {
    const strat: Strategy = {
      segments: [{ indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 0, startDate: '2020-01-01', endDate: '2020-06-01' }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toContain('大于 0')
  })
})

describe('runSimulation', () => {
  const baseStrategy: Strategy = {
    segments: [
      { indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000, startDate: '2020-01-01', endDate: '2020-03-01' },
    ],
    fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
    evalWindow: { startDate: '2020-01-01', endDate: '2020-03-31' },
  }

  it('generates correct number of transactions', () => {
    const { transactions } = runSimulation(baseStrategy, priceMap)
    expect(transactions.length).toBe(3) // Jan 1, Feb 1, Mar 1
  })

  it('totalCost equals sum of gross amounts', () => {
    const { totalCost } = runSimulation(baseStrategy, priceMap)
    expect(totalCost).toBe(3000)
  })

  it('shares and market value are positive', () => {
    const { marketValue, transactions } = runSimulation(baseStrategy, priceMap)
    expect(marketValue).toBeGreaterThan(0)
    for (const tx of transactions) {
      expect(tx.shares).toBeGreaterThan(0)
    }
  })

  it('applies purchase fee correctly', () => {
    const strat: Strategy = {
      ...baseStrategy,
      fees: { purchaseFee: 0.01, redemptionFee: 0, managementFee: 0 },
    }
    const { totalCost, transactions } = runSimulation(strat, priceMap)
    // Gross amount per tx = 1000, total = 3000
    expect(totalCost).toBe(3000)
    // Shares = 1000 * (1 - 0.01) / price, less than without fee
    expect(transactions[0].shares).toBe(990 / transactions[0].price)
  })

  it('applies redemption fee on market value', () => {
    const noFee = runSimulation(baseStrategy, priceMap)
    const withFee = runSimulation(
      { ...baseStrategy, fees: { purchaseFee: 0, redemptionFee: 0.01, managementFee: 0 } },
      priceMap,
    )
    expect(withFee.marketValue).toBeCloseTo(noFee.marketValue * 0.99, 0)
  })

  it('returns xirr for profitable strategy', () => {
    const { xirr: result } = runSimulation(baseStrategy, priceMap)
    // Prices go up from ~1002 to ~1180, so XIRR should be positive
    expect(result).toBeGreaterThan(0)
  })

  it('computes cumulativeReturn correctly', () => {
    const { totalCost, marketValue, cumulativeReturn } = runSimulation(baseStrategy, priceMap)
    expect(cumulativeReturn).toBeCloseTo((marketValue - totalCost) / totalCost, 10)
  })
})

describe('runSimulation smart mode', () => {
  function pad(n: number) { return String(n).padStart(2, '0') }
  // Create mock with varying PE using local dates (no timezone shift)
  function makeDataWithPE(name: string, startYear: number, count: number, basePrice = 1000): IndexData {
    const rows: { date: string; price: number; metric?: number }[] = []
    for (let i = 0; i < count; i++) {
      const d = new Date(startYear, 0, 1)
      d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const pe = 8 + (i / count) * 14  // 8 → 22 across the range
      rows.push({ date: ds, price: basePrice + i, metric: pe })
    }
    return new IndexDataImpl(name, rows)
  }

  const seriesWithPE = makeDataWithPE('沪深300全收益', 2020, 366, 1000)
  const mapWithPE = new Map<string, IndexData>()
  mapWithPE.set('沪深300全收益', seriesWithPE)

  it('applies smart multiplier > 1.0 for cheap PE, < 1.0 for expensive PE', () => {
    // Build data: 300 days of PE=10, then 30 days of PE=20, then 35 days of PE=30
    const rowsPe: { date: string; price: number; metric?: number }[] = []
    for (let i = 0; i < 365; i++) {
      const d = new Date(2020, 0, 1)
      d.setDate(d.getDate() + i)
      const pad = (n: number) => String(n).padStart(2, '0')
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const pe = i < 300 ? 10 : i < 330 ? 20 : 30
      rowsPe.push({ date: ds, price: 1000 + i, metric: pe })
    }
    const peData = new IndexDataImpl('沪深300全收益', rowsPe)
    const peMap = new Map<string, IndexData>()
    peMap.set('沪深300全收益', peData)

    const smartCfg: SmartConfig = {
      lookbackYears: 10,
      cheapPercentile: 33, cheapMultiplier: 1.5,
      expensivePercentile: 66, expensiveMultiplier: 0.5,
    }

    // Test cheap: Jan 2020, PE=10, only 1 data point → 0% ≤ 33% → 1.5x
    const stratCheap: Strategy = {
      segments: [{
        indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000,
        amountMode: 'smart', smartConfig: smartCfg,
        startDate: '2020-01-01', endDate: '2020-01-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    const { transactions: cheapTx } = runSimulation(stratCheap, peMap)
    expect(cheapTx[0].grossAmount).toBe(1500)

    // Test expensive: Dec 2020, PE=30 (>66th percentile → 0.5x)
    const stratExp: Strategy = {
      segments: [{
        indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000,
        amountMode: 'smart', smartConfig: smartCfg,
        startDate: '2020-12-01', endDate: '2020-12-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-12-01', endDate: '2020-12-31' },
    }
    const { transactions: expTx } = runSimulation(stratExp, peMap)
    expect(expTx[0].grossAmount).toBe(500)
  })

  it('fixed mode unaffected by smart changes', () => {
    const strategy: Strategy = {
      segments: [{
        indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 500,
        amountMode: 'fixed',
        startDate: '2020-01-01', endDate: '2020-03-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    const { transactions, totalCost } = runSimulation(strategy, mapWithPE)
    expect(transactions.length).toBe(3)
    expect(totalCost).toBe(1500) // 3 × 500
  })
})
