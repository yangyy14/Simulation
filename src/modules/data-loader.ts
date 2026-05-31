export interface PriceSeries {
  name: string
  getPrice(date: string): number | null
}

export class IndexPriceSeries implements PriceSeries {
  name: string
  private prices: Map<string, number>
  private sortedDates: string[]

  constructor(name: string, rows: { date: string; price: number }[]) {
    this.name = name
    this.prices = new Map()
    this.sortedDates = []
    for (const row of rows) {
      this.prices.set(row.date, row.price)
      this.sortedDates.push(row.date)
    }
    this.sortedDates.sort()
  }

  getPrice(targetDate: string): number | null {
    // Direct hit
    if (this.prices.has(targetDate)) {
      return this.prices.get(targetDate)!
    }
    // Roll forward: find first date >= target
    for (const d of this.sortedDates) {
      if (d >= targetDate) {
        return this.prices.get(d)!
      }
    }
    return null
  }
}

export function parseCSV(csvText: string, name: string): IndexPriceSeries {
  const lines = csvText.trim().split(/\r?\n/)
  const rows: { date: string; price: number }[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const [date, priceStr] = line.split(',')
    const price = parseFloat(priceStr)
    if (date && !isNaN(price)) {
      rows.push({ date: date.trim(), price })
    }
  }
  return new IndexPriceSeries(name, rows)
}

export async function loadIndexData(indexName: string): Promise<IndexPriceSeries> {
  const resp = await fetch(`/data/${indexName}.csv`)
  if (!resp.ok) {
    throw new Error(`Failed to load data for ${indexName}: ${resp.status}`)
  }
  const csvText = await resp.text()
  return parseCSV(csvText, indexName)
}
