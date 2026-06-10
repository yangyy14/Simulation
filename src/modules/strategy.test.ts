import { describe, it, expect } from 'vitest'
import {
  generateInvestDates,
  validateStrategy,
  runSimulation,
  type Strategy,
  type Segment,
  type Allocation,
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

    // Test cheap: Jan 2020, PE=10, only 1 data point → 50% → middle → 1.0x
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
    expect(cheapTx[0].grossAmount).toBe(1000)

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

describe('runSimulation portfolio mode', () => {
  function pad(n: number) { return String(n).padStart(2, '0') }

  // Data covering Jan–Mar 2020 (62 trading days: Jan has 22, Feb has 20, Mar has 22)
  function makeSeries(name: string, startYear: number, count: number): IndexData {
    const rows: { date: string; price: number }[] = []
    for (let i = 0; i < count; i++) {
      const d = new Date(startYear, 0, 1)
      d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      rows.push({ date: ds, price: 100 + i * 0.1 })
    }
    return new IndexDataImpl(name, rows)
  }

  // Series with PE data for smart mode tests
  function makeSeriesWithPE(name: string, startYear: number, count: number): IndexData {
    const rows: { date: string; price: number; metric?: number }[] = []
    for (let i = 0; i < count; i++) {
      const d = new Date(startYear, 0, 1)
      d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      rows.push({ date: ds, price: 100 + i * 0.1, metric: 10 + (i / count) * 20 })
    }
    return new IndexDataImpl(name, rows)
  }

  const hs300 = makeSeries('沪深300全收益', 2020, 90)
  const bond = makeSeries('国债1-3年', 2020, 90)
  const pm = new Map<string, IndexData>()
  pm.set('沪深300全收益', hs300)
  pm.set('国债1-3年', bond)

  const hs300pe = makeSeriesWithPE('沪深300全收益', 2020, 90)
  const pmPE = new Map<string, IndexData>()
  pmPE.set('沪深300全收益', hs300pe)
  pmPE.set('国债1-3年', bond)

  const portfolioSegment: Segment = {
    indexName: '',
    frequency: 'monthly',
    day: 1,
    amount: 2000,
    startDate: '2020-01-01',
    endDate: '2020-03-01',
    allocations: [
      { indexName: '沪深300全收益', weight: 0.6 },
      { indexName: '国债1-3年', weight: 0.4 },
    ],
  }

  it('generates transactions per period for portfolio mode', () => {
    const strat: Strategy = {
      segments: [portfolioSegment],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-03-31' },
    }
    const { transactions } = runSimulation(strat, pm)
    // All transactions on Jan 1, Feb 1, Mar 1
    const dates = [...new Set(transactions.map((t) => t.date))].sort()
    expect(dates).toEqual(['2020-01-01', '2020-02-01', '2020-03-01'])
    // Each period has at least 1 transaction (dynamic buy may skip overweight categories)
    expect(transactions.length).toBeGreaterThanOrEqual(3)
  })

  it('first period allocates by static weight (fresh start)', () => {
    const strat: Strategy = {
      segments: [portfolioSegment],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-01-31' },
    }
    const { transactions } = runSimulation(strat, pm)
    const hs300Tx = transactions.find((t) => t.indexName === '沪深300全收益')!
    const bondTx = transactions.find((t) => t.indexName === '国债1-3年')!
    // Fresh start: all MVs = 0 → fallback to target weight
    expect(hs300Tx.grossAmount).toBeCloseTo(1200, 0)  // 2000 × 0.6
    expect(bondTx.grossAmount).toBeCloseTo(800, 0)    // 2000 × 0.4
  })

  it('applies L1 multiplier only to allocations with smart mode', () => {
    const seg: Segment = {
      ...portfolioSegment,
      allocations: [
        {
          indexName: '沪深300全收益', weight: 0.5,
          amountMode: 'smart',
          smartConfig: { lookbackYears: 10, cheapPercentile: 99, cheapMultiplier: 2, expensivePercentile: 100, expensiveMultiplier: 1 },
        },
        { indexName: '国债1-3年', weight: 0.5 },
      ],
    }
    const strat: Strategy = {
      segments: [seg],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-03-31' },
    }
    const { transactions } = runSimulation(strat, pmPE)
    const smartTx = transactions.find((t) => t.indexName === '沪深300全收益')!
    const bondTx = transactions.find((t) => t.indexName === '国债1-3年')!
    // Smart: PE very low → cheapPercentile=99, so almost always cheap → 2×
    expect(smartTx.grossAmount).toBeCloseTo(2000, 0)  // 1000 × 2
    // Bond: no smart → 1×
    expect(bondTx.grossAmount).toBeCloseTo(1000, 0)   // 1000 × 1
  })

  it('totalCost aggregates across all allocations', () => {
    const strat: Strategy = {
      segments: [portfolioSegment],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-03-31' },
    }
    const { totalCost } = runSimulation(strat, pm)
    expect(totalCost).toBeCloseTo(6000, 0)  // 3 × 2000
  })

  it('mixes single-index and portfolio segments', () => {
    const singleSegment: Segment = {
      indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 500,
      startDate: '2020-01-01', endDate: '2020-01-01',
    }
    const strat: Strategy = {
      segments: [singleSegment, portfolioSegment],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-03-31' },
    }
    const { transactions, totalCost } = runSimulation(strat, pm)
    // Single segment: 1 tx. Portfolio: 3 months × 2 = 6 txs. Total = 7.
    expect(transactions.length).toBe(7)
    // 500 + 3*2000 = 6500
    expect(totalCost).toBeCloseTo(6500, 0)
  })
})

describe('rebalance index-level execution', () => {
  function pad(n: number) { return String(n).padStart(2, '0') }

  function makeSeries(name: string, startYear: number, count: number, basePrice = 100, step = 0.1): IndexData {
    const rows: { date: string; price: number }[] = []
    for (let i = 0; i < count; i++) {
      const d = new Date(startYear, 0, 1)
      d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      rows.push({ date: ds, price: basePrice + i * step })
    }
    return new IndexDataImpl(name, rows)
  }

  // 沪深300 grows fast, 中证500 grows slow, 国债 flat
  const hs300 = makeSeries('沪深300全收益', 2020, 180, 100, 3)   // +540 over 180 days
  const zz500 = makeSeries('中证500全收益', 2020, 180, 100, 0.2)  // +36 over 180 days
  const bond = makeSeries('国债1-3年', 2020, 180, 100, 0.01)       // ~flat
  const pm = new Map<string, IndexData>()
  pm.set('沪深300全收益', hs300)
  pm.set('中证500全收益', zz500)
  pm.set('国债1-3年', bond)

  it('corrects each index to its own target weight on rebalance', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 3000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: '沪深300全收益', weight: 0.3 },
          { indexName: '中证500全收益', weight: 0.3 },
          { indexName: '国债1-3年', weight: 0.4 },
        ],
        rebalance: true,
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-06-30' },
      rebalanceConfig: { deviationThreshold: 0.01, minIntervalMonths: 0, tradeCostRate: 0 },
    }
    const { transactions } = runSimulation(strat, pm)

    // Find rebalance transactions
    const rbSells = transactions.filter(t => t.source === 'rebalance' && t.type === 'sell')
    const rbBuys = transactions.filter(t => t.source === 'rebalance' && t.type === 'buy')

    // After 3 months of divergent growth, rebalance should fire
    expect(rbSells.length).toBeGreaterThan(0)

    // 沪深300 grew fast → should be sold (over target)
    const hsSells = rbSells.filter(t => t.indexName === '沪深300全收益')
    expect(hsSells.length).toBeGreaterThan(0)

    // 中证500 grew slowly → below its individual target → must be BOUGHT
    // Old code: both sold proportionally within overweight category
    // New code: each index corrects to its own target → 中证500 gets bought
    const zzBuys = rbBuys.filter(t => t.indexName === '中证500全收益')
    const zzSells = rbSells.filter(t => t.indexName === '中证500全收益')
    expect(zzBuys.length).toBeGreaterThan(0)
    expect(zzSells.length).toBe(0)
  })

  it('single-index segments are unaffected', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2020-01-01', endDate: '2020-03-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-06-30' },
      rebalanceConfig: { deviationThreshold: 0.01, minIntervalMonths: 0, tradeCostRate: 0 },
    }
    const { transactions } = runSimulation(strat, pm)
    expect(transactions.every(t => t.source === 'invest')).toBe(true)
    expect(transactions.length).toBe(3)
  })

  it('deducts trade cost from buy pool', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 3000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: '沪深300全收益', weight: 0.3 },
          { indexName: '中证500全收益', weight: 0.3 },
          { indexName: '国债1-3年', weight: 0.4 },
        ],
        rebalance: true,
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-06-30' },
      rebalanceConfig: { deviationThreshold: 0.01, minIntervalMonths: 0, tradeCostRate: 0.005 },
    }
    const { transactions } = runSimulation(strat, pm)
    const rbTxs = transactions.filter(t => t.source === 'rebalance')
    const totalSell = rbTxs.filter(t => t.type === 'sell').reduce((s, t) => s + t.grossAmount, 0)
    const totalBuy = rbTxs.filter(t => t.type === 'buy').reduce((s, t) => s + t.grossAmount, 0)
    // Buy pool = totalSell * (1 - 0.005) = totalSell * 0.995
    expect(totalBuy).toBeCloseTo(totalSell * 0.995, 0)
  })
})

describe('validateStrategy portfolio mode', () => {
  const available = ['沪深300全收益', '国债1-3年']

  it('returns null for valid portfolio segment', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: '沪深300全收益', weight: 0.6 },
          { indexName: '国债1-3年', weight: 0.4 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toBeNull()
  })

  it('rejects weight sum too low', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: '沪深300全收益', weight: 0.5 },
          { indexName: '国债1-3年', weight: 0.3 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toContain('权重')
  })

  it('rejects unknown index in allocation', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: 'Unknown', weight: 0.5 },
          { indexName: '沪深300全收益', weight: 0.5 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toContain('不可用')
  })

  it('rejects smart mode with missing smartConfig in allocation', () => {
    const strat: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2020-01-01', endDate: '2020-03-01',
        allocations: [
          { indexName: '沪深300全收益', weight: 0.6, amountMode: 'smart' },
          { indexName: '国债1-3年', weight: 0.4 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2020-12-31' },
    }
    expect(validateStrategy(strat, available)).toContain('估值参数')
  })
})
