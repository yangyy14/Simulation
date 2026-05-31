import { describe, it, expect } from 'vitest'
import {
  generateInvestDates,
  validateStrategy,
  runSimulation,
  type Strategy,
  type Segment,
} from './strategy'
import { IndexPriceSeries, type PriceSeries } from './data-loader'

function makeDateSeries(name: string, startDate: string, count: number, basePrice = 1000, step = 2): PriceSeries {
  const rows: { date: string; price: number }[] = []
  const start = new Date(startDate)
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().split('T')[0]
    rows.push({ date: ds, price: basePrice + i * step })
  }
  return new IndexPriceSeries(name, rows)
}

// 6 months of daily data: Jan-Jun 2020
const series = makeDateSeries('沪深300全收益', '2020-01-01', 182, 1000, 1)
const priceMap = new Map<string, PriceSeries>()
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
