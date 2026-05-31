import { describe, it, expect } from 'vitest'
import { parseCSV, IndexDataImpl } from './data-loader'

const sampleCSV = `日期,收盘价
2004-01-02,1000.00
2004-01-05,1012.34
2004-01-06,1008.76
2004-01-09,1018.90
2004-01-12,1025.45`

describe('parseCSV', () => {
  it('parses valid CSV into IndexDataImpl', () => {
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

const samplePE_CSV = `日期,收盘价,市盈率
2004-01-02,1000.00,15.5
2004-01-05,1012.34,15.8
2004-01-06,1008.76,15.6
2004-01-09,1018.90,16.0
2004-01-12,1025.45,16.2`

describe('getMetric', () => {
  it('returns null for two-column CSV (no PE data)', () => {
    const series = parseCSV(sampleCSV, 'test')
    expect(series.getMetric('2004-01-05')).toBe(null)
  })

  it('parses PE from three-column CSV', () => {
    const series = parseCSV(samplePE_CSV, 'test')
    expect(series.getMetric('2004-01-05')).toBe(15.8)
  })

  it('rolls forward PE on non-trading day', () => {
    const series = parseCSV(samplePE_CSV, 'test')
    // 2004-01-03 is Saturday → next trading day is 2004-01-05, PE=15.8
    expect(series.getMetric('2004-01-03')).toBe(15.8)
  })

  it('returns null for PE beyond last entry', () => {
    const series = parseCSV(samplePE_CSV, 'test')
    expect(series.getMetric('2020-01-01')).toBe(null)
  })

  it('falls back to price when no PE column (gold)', () => {
    const series = parseCSV(sampleCSV, 'AU9999')
    expect(series.getMetric('2004-01-05')).toBe(1012.34) // same as price
  })
})

describe('getMetricsInRange', () => {
  it('returns PE values in date range', () => {
    const series = parseCSV(samplePE_CSV, 'test')
    const vals = series.getMetricsInRange('2004-01-01', '2004-01-10')
    expect(vals).toEqual([15.5, 15.8, 15.6, 16.0])
  })

  it('returns empty for range before data', () => {
    const series = parseCSV(samplePE_CSV, 'test')
    expect(series.getMetricsInRange('2000-01-01', '2000-01-10')).toEqual([])
  })
})

describe('IndexDataImpl', () => {
  it('handles empty data gracefully', () => {
    const series = new IndexDataImpl('empty', [])
    expect(series.getPrice('2004-01-01')).toBe(null)
  })

  it('handles single-row data', () => {
    const series = new IndexDataImpl('single', [
      { date: '2004-01-02', price: 1000 },
    ])
    expect(series.getPrice('2004-01-02')).toBe(1000)
    expect(series.getPrice('2004-01-01')).toBe(1000) // roll forward
    expect(series.getPrice('2004-01-03')).toBe(null) // beyond
  })
})
