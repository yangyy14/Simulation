import { describe, it, expect } from 'vitest'
import { parseCSV, IndexPriceSeries } from './data-loader'

const sampleCSV = `日期,收盘价
2004-01-02,1000.00
2004-01-05,1012.34
2004-01-06,1008.76
2004-01-09,1018.90
2004-01-12,1025.45`

describe('parseCSV', () => {
  it('parses valid CSV into IndexPriceSeries', () => {
    const series = parseCSV(sampleCSV, 'test')
    expect(series.name).toBe('test')
  })

  it('returns correct price for exact date', () => {
    const series = parseCSV(sampleCSV, 'test')
    expect(series.getPrice('2004-01-05')).toBe(1012.34)
  })

  it('rolls forward to next trading day when date missing', () => {
    const series = parseCSV(sampleCSV, 'test')
    // 2004-01-03 is a Saturday, not in data → should get 2004-01-05 price
    expect(series.getPrice('2004-01-03')).toBe(1012.34)
  })

  it('rolls forward for weekday with no data', () => {
    const series = parseCSV(sampleCSV, 'test')
    // 2004-01-07 is a Wednesday, 2004-01-08 is not in data → should get 2004-01-09
    expect(series.getPrice('2004-01-08')).toBe(1018.90)
  })

  it('returns null for date beyond last entry', () => {
    const series = parseCSV(sampleCSV, 'test')
    expect(series.getPrice('2020-01-01')).toBe(null)
  })

  it('returns first price for date before first entry', () => {
    const series = parseCSV(sampleCSV, 'test')
    expect(series.getPrice('2003-12-31')).toBe(1000.00)
  })
})

describe('IndexPriceSeries', () => {
  it('handles empty data gracefully', () => {
    const series = new IndexPriceSeries('empty', [])
    expect(series.getPrice('2004-01-01')).toBe(null)
  })

  it('handles single-row data', () => {
    const series = new IndexPriceSeries('single', [
      { date: '2004-01-02', price: 1000 },
    ])
    expect(series.getPrice('2004-01-02')).toBe(1000)
    expect(series.getPrice('2004-01-01')).toBe(1000) // roll forward
    expect(series.getPrice('2004-01-03')).toBe(null) // beyond
  })
})
