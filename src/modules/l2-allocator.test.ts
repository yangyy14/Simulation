import { describe, it, expect } from 'vitest'
import { computeStockWeight, type L2Config } from './l2-allocator'
import { IndexDataImpl, type IndexData } from './data-loader'

function pad(n: number) { return String(n).padStart(2, '0') }

function makeStockData(peValues: Array<number | null>): IndexData {
  const rows: { date: string; price: number; metric?: number }[] = []
  for (let i = 0; i < peValues.length; i++) {
    const d = new Date(2020, 0, 1 + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    rows.push({ date: ds, price: 100 + i, metric: peValues[i] ?? undefined })
  }
  return new IndexDataImpl('stock', rows)
}

function makeBondData(ytmValues: Array<number | null>): IndexData {
  const rows: { date: string; price: number; metric?: number }[] = []
  for (let i = 0; i < ytmValues.length; i++) {
    const d = new Date(2020, 0, 1 + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    rows.push({ date: ds, price: 100 + i, metric: ytmValues[i] ?? undefined })
  }
  return new IndexDataImpl('bond', rows)
}

const defaultConfig: L2Config = {
  stockMinPct: 0.4, stockMaxPct: 0.8,
  lookbackYears: 5, deadZoneLow: 40, deadZoneHigh: 60,
}

describe('computeStockWeight', () => {
  it('returns null when PE is null', () => {
    const stock = makeStockData([null])
    const bond = makeBondData([2.5])
    expect(computeStockWeight(stock, bond, '2020-01-01', 0.6, defaultConfig)).toBeNull()
  })

  it('returns null when YTM is null', () => {
    const stock = makeStockData([15])
    const bond = makeBondData([null])
    expect(computeStockWeight(stock, bond, '2020-01-01', 0.6, defaultConfig)).toBeNull()
  })

  it('returns null when history has less than 2 points', () => {
    const stock = makeStockData([15])
    const bond = makeBondData([2.5])
    expect(computeStockWeight(stock, bond, '2020-01-01', 0.6, defaultConfig)).toBeNull()
  })

  it('returns stockMinPct when spread is at historical minimum (stock expensive)', () => {
    // PE: 10, 15, 20 → spreads: 7.5, 4.17, 2.5 (min=2.5)
    // target=day3 (PE=20): current spread=2.5=min → stockMinPct
    const stock = makeStockData([10, 15, 20])
    const bond = makeBondData([2.5, 2.5, 2.5])
    const r = computeStockWeight(stock, bond, '2020-01-03', 0.6, defaultConfig)
    expect(r).not.toBeNull()
    expect(r!.stockWeight).toBe(defaultConfig.stockMinPct)
  })

  it('returns staticStockWeight when all spreads are equal (no information)', () => {
    // All PE=15, all YTM=3 → every spread is 3.67, deadLow=deadHigh=3.67
    const stock = makeStockData(Array(10).fill(15))
    const bond = makeBondData(Array(10).fill(3))
    const r = computeStockWeight(stock, bond, '2020-01-10', 0.6, defaultConfig)
    expect(r).not.toBeNull()
    expect(r!.stockWeight).toBe(0.6) // unchanged
  })

  it('returns stockMaxPct when spread is at historical maximum', () => {
    const stock = makeStockData([20, 15, 10])
    const bond = makeBondData([2.5, 2.5, 2.5])
    const r = computeStockWeight(stock, bond, '2020-01-03', 0.6, defaultConfig)
    expect(r).not.toBeNull()
    expect(r!.stockWeight).toBe(defaultConfig.stockMaxPct)
  })

  it('interpolates above static when spread above deadHigh but not at max', () => {
    const stockPEs = Array.from({ length: 10 }, (_, i) => 19 - i)
    const bondYTMs = Array(10).fill(3)
    const stock = makeStockData(stockPEs)
    const bond = makeBondData(bondYTMs)
    const r = computeStockWeight(stock, bond, '2020-01-08', 0.6, defaultConfig)
    expect(r).not.toBeNull()
    expect(r!.stockWeight).toBeGreaterThan(0.6)
    expect(r!.stockWeight).toBeLessThanOrEqual(0.8)
  })

  it('clamps result to [stockMinPct, stockMaxPct]', () => {
    const stock = makeStockData([10, 11, 12, 13, 14])
    const bond = makeBondData([1, 1, 1, 1, 1])
    const r = computeStockWeight(stock, bond, '2020-01-05', 0.6, defaultConfig)
    expect(r).not.toBeNull()
    expect(r!.stockWeight).toBeGreaterThanOrEqual(0.4)
    expect(r!.stockWeight).toBeLessThanOrEqual(0.8)
  })
})
