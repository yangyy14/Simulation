import { describe, it, expect } from 'vitest'
import { evaluateRebalance, type RebalanceConfig } from './rebalancer-v2'

const defaultConfig: RebalanceConfig = {
  deviationThreshold: 0.10,
  minIntervalMonths: 12,
  tradeCostRate: 0.005,
}

interface CatMV {
  name: string
  marketValue: number
  targetWeight: number
}

describe('evaluateRebalance', () => {
  it('returns null when no category deviates above threshold', () => {
    // Stock 52% (target 50%, +2pp), Bond 30% (+0pp), Gold 18% (-2pp)
    // Max deviation = 2pp < 10pp threshold → no trigger
    const cats: CatMV[] = [
      { name: 'stock', marketValue: 52000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 30000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 18000, targetWeight: 0.2 },
    ]

    const r = evaluateRebalance(cats, '2020-06-01', defaultConfig, null)
    expect(r).toBeNull()
  })

  it('triggers when a category deviates above threshold', () => {
    // Stock 65% (target 50%, +15pp) > 10pp → trigger
    const cats: CatMV[] = [
      { name: 'stock', marketValue: 65000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 20000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 15000, targetWeight: 0.2 },
    ]

    const r = evaluateRebalance(cats, '2020-06-01', defaultConfig, null)
    expect(r).not.toBeNull()
    expect(r!.trigger).toBe('deviation')
    // Stock overweight: sell stock, buy bond and gold
    expect(r!.sells.length).toBeGreaterThan(0)
    expect(r!.buys.length).toBeGreaterThan(0)
  })

  it('returns null when min interval not met', () => {
    const cats: CatMV[] = [
      { name: 'stock', marketValue: 65000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 20000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 15000, targetWeight: 0.2 },
    ]

    // Last rebalance 3 months ago, min interval 12 months
    const r = evaluateRebalance(cats, '2020-06-01', defaultConfig, '2020-03-01')
    expect(r).toBeNull()
  })

  it('sells multiple overweight categories proportionally', () => {
    // Stock 65% (+15), Bond 35% (+5 → no, +5pp), Gold 0% (-20)
    const cats: CatMV[] = [
      { name: 'stock', marketValue: 65000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 35000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 0, targetWeight: 0.2 },
    ]

    const r = evaluateRebalance(cats, '2020-06-01', defaultConfig, null)
    expect(r).not.toBeNull()
    // Sell stock (65k-50k=15k), sell bond (35k-30k=5k)
    const stockSell = r!.sells.find(s => s.name === 'stock')
    const bondSell = r!.sells.find(s => s.name === 'bond')
    expect(stockSell!.amount).toBeCloseTo(15000, 0)
    expect(bondSell!.amount).toBeCloseTo(5000, 0)
    // All buy goes to gold (only underweight)
    expect(r!.buys.length).toBe(1)
    expect(r!.buys[0]!.name).toBe('gold')
    expect(r!.buys[0]!.amount).toBeCloseTo(20000 * 0.995, 0)
  })

  it('deducts trade cost from buy pool', () => {
    const cats: CatMV[] = [
      { name: 'stock', marketValue: 65000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 35000, targetWeight: 0.5 },
    ]

    const r = evaluateRebalance(cats, '2020-06-01', defaultConfig, null)
    expect(r).not.toBeNull()
    // Sell stock: 65k-50k=15k, buyPool = 15k * 0.995 = 14925
    expect(r!.totalCost).toBeCloseTo(75, 0)
    expect(r!.buys[0]!.amount).toBeCloseTo(14925, 0)
  })
})
