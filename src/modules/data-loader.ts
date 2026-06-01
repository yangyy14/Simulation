export interface IndexData {
  name: string
  getPrice(date: string): number | null
  getMetric(date: string): number | null
  getMetricsInRange(startDate: string, endDate: string): number[]
}

export class IndexDataImpl implements IndexData {
  name: string
  private usePriceAsMetric: boolean
  private prices: Map<string, number>
  private metrics: Map<string, number>
  private sortedDates: string[]

  constructor(name: string, rows: { date: string; price: number; metric?: number }[], usePriceAsMetric = false) {
    this.name = name
    this.usePriceAsMetric = usePriceAsMetric
    this.prices = new Map()
    this.metrics = new Map()
    this.sortedDates = []
    for (const row of rows) {
      this.prices.set(row.date, row.price)
      if (row.metric !== undefined) {
        this.metrics.set(row.date, row.metric)
      }
      this.sortedDates.push(row.date)
    }
    this.sortedDates.sort()
  }

  getPrice(targetDate: string): number | null {
    if (this.prices.has(targetDate)) {
      return this.prices.get(targetDate)!
    }
    for (const d of this.sortedDates) {
      if (d >= targetDate) {
        return this.prices.get(d)!
      }
    }
    return null
  }

  getMetricsInRange(startDate: string, endDate: string): number[] {
    const metricSource = this.usePriceAsMetric ? this.prices : this.metrics
    const values: number[] = []
    const seen = new Set<number>()
    for (const d of this.sortedDates) {
      if (d < startDate) continue
      if (d > endDate) break
      const v = metricSource.get(d)
      if (v !== undefined && !seen.has(v)) {
        seen.add(v)
        values.push(v)
      }
    }
    return values
  }

  getMetric(targetDate: string): number | null {
    // Gold: no PE data, use price as metric for percentile calc
    if (this.usePriceAsMetric) {
      return this.getPrice(targetDate)
    }
    if (this.metrics.has(targetDate)) {
      return this.metrics.get(targetDate)!
    }
    for (const d of this.sortedDates) {
      if (d >= targetDate) {
        const v = this.metrics.get(d)
        if (v !== undefined) return v
      }
    }
    return null
  }
}

export function parseCSV(csvText: string, name: string): IndexDataImpl {
  const lines = csvText.trim().split(/\r?\n/)
  const rows: { date: string; price: number; metric?: number }[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(',')
    const date = cols[0]?.trim()
    const price = parseFloat(cols[1])
    if (!date || isNaN(price)) continue
    const row: { date: string; price: number; metric?: number } = { date, price }
    if (cols.length >= 3) {
      const metric = parseFloat(cols[2])
      if (!isNaN(metric)) row.metric = metric
    }
    rows.push(row)
  }
  return new IndexDataImpl(name, rows, name === 'AU9999')
}

export async function loadIndexData(indexName: string): Promise<IndexDataImpl> {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const resp = await fetch(`${baseUrl}data/${indexName}.csv`)
  if (!resp.ok) {
    throw new Error(`Failed to load data for ${indexName}: ${resp.status}`)
  }
  const csvText = await resp.text()
  return parseCSV(csvText, indexName)
}
