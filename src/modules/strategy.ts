import { type IndexData } from './data-loader'
import { xirr } from './xirr'
import { computeMultiplier, type SmartConfig } from './valuator'

export type Frequency = 'monthly' | 'weekly'
export type AmountMode = 'fixed' | 'smart'

export interface Segment {
  indexName: string
  frequency: Frequency
  day: number // 1-28 for monthly, 0-6 for weekly (0=Sun)
  amount: number // gross investment per period (before fees). fixed=actual, smart=base
  amountMode?: AmountMode // default 'fixed'
  smartConfig?: SmartConfig // only used when amountMode='smart'
  startDate: string
  endDate: string
}

export interface Strategy {
  segments: Segment[]
  fees: {
    purchaseFee: number // e.g. 0.0015 = 0.15%
    redemptionFee: number
    managementFee: number // annual, e.g. 0.015 = 1.5%
  }
  evalWindow: {
    startDate: string
    endDate: string
  }
}

export interface Transaction {
  date: string
  indexName: string
  price: number
  shares: number
  grossAmount: number // amount invested (before purchase fee)
}

export interface PortfolioSummary {
  totalCost: number
  marketValue: number
  cumulativeReturn: number
  xirr: number | null
  transactions: Transaction[]
}

export function validateStrategy(
  strategy: Strategy,
  availableIndices: string[],
): string | null {
  if (strategy.segments.length === 0) return null

  for (let i = 0; i < strategy.segments.length; i++) {
    const s = strategy.segments[i]
    if (!availableIndices.includes(s.indexName)) {
      return `片段 #${i + 1}: 指数 "${s.indexName}" 不可用`
    }
    if (s.amount <= 0) {
      return `片段 #${i + 1}: 定投金额必须大于 0`
    }
    if (s.startDate > s.endDate) {
      return `片段 #${i + 1}: 开始日期不能晚于结束日期`
    }
    if (s.frequency === 'monthly' && (s.day < 1 || s.day > 28)) {
      return `片段 #${i + 1}: 按月定投日必须在 1-28 之间`
    }
    if (s.frequency === 'weekly' && (s.day < 0 || s.day > 6)) {
      return `片段 #${i + 1}: 按周定投日必须在 0-6 之间（0=周日）`
    }
    if (s.amountMode === 'smart') {
      if (!s.smartConfig) {
        return `片段 #${i + 1}: 智能定投模式必须配置估值参数`
      }
      if (s.smartConfig.lookbackYears < 1) {
        return `片段 #${i + 1}: 回溯年数至少为 1`
      }
      if (s.smartConfig.cheapPercentile >= s.smartConfig.expensivePercentile) {
        return `片段 #${i + 1}: 便宜阈值必须小于昂贵阈值`
      }
    }
  }
  return null
}

export function generateInvestDates(segment: Segment): string[] {
  const dates: string[] = []
  const start = new Date(segment.startDate + 'T00:00:00')
  const end = new Date(segment.endDate + 'T00:00:00')

  if (segment.frequency === 'monthly') {
    let current = new Date(start.getFullYear(), start.getMonth(), segment.day)
    if (current < start) {
      current = new Date(start.getFullYear(), start.getMonth() + 1, segment.day)
    }
    while (current <= end) {
      const y = current.getFullYear()
      const m = String(current.getMonth() + 1).padStart(2, '0')
      const d = String(current.getDate()).padStart(2, '0')
      dates.push(`${y}-${m}-${d}`)
      current = new Date(current.getFullYear(), current.getMonth() + 1, segment.day)
    }
  } else {
    let current = new Date(start)
    while (current.getDay() !== segment.day) {
      current.setDate(current.getDate() + 1)
    }
    while (current <= end) {
      const y = current.getFullYear()
      const m = String(current.getMonth() + 1).padStart(2, '0')
      const d = String(current.getDate()).padStart(2, '0')
      dates.push(`${y}-${m}-${d}`)
      current.setDate(current.getDate() + 7)
    }
  }
  return dates
}

export function runSimulation(
  strategy: Strategy,
  priceMap: Map<string, IndexData>,
): PortfolioSummary {
  const transactions: Transaction[] = []

  for (const segment of strategy.segments) {
    const series = priceMap.get(segment.indexName)
    if (!series) continue

    const dates = generateInvestDates(segment)
    for (const date of dates) {
      const price = series.getPrice(date)
      if (price === null) continue

      // Compute multiplier: smart mode uses Valuator, fixed mode is always 1x
      let multiplier = 1.0
      if (segment.amountMode === 'smart' && segment.smartConfig) {
        multiplier = computeMultiplier(series, date, segment.smartConfig)
      }
      const grossAmount = segment.amount * multiplier

      const netAmount = grossAmount * (1 - strategy.fees.purchaseFee)
      const shares = netAmount / price
      transactions.push({
        date,
        indexName: segment.indexName,
        price,
        shares,
        grossAmount,
      })
    }
  }

  const evalEnd = strategy.evalWindow.endDate
  let totalCost = 0
  let marketValue = 0

  for (const tx of transactions) {
    totalCost += tx.grossAmount

    const currentSeries = priceMap.get(tx.indexName)
    const currentPrice = currentSeries?.getPrice(evalEnd)
    if (currentPrice === null || currentPrice === undefined) continue

    const holdingYears = yearsBetween(tx.date, evalEnd)
    const mgmtFactor = Math.pow(1 - strategy.fees.managementFee, holdingYears)
    marketValue += tx.shares * currentPrice * mgmtFactor
  }

  marketValue *= 1 - strategy.fees.redemptionFee

  const cumulativeReturn = totalCost > 0 ? (marketValue - totalCost) / totalCost : 0

  const cashflows: { date: string; amount: number }[] = []
  for (const tx of transactions) {
    cashflows.push({ date: tx.date, amount: -tx.grossAmount })
  }
  if (marketValue > 0) {
    cashflows.push({ date: evalEnd, amount: marketValue })
  }

  let xirrResult: number | null = null
  if (cashflows.length >= 2) {
    try {
      xirrResult = xirr(cashflows)
    } catch {
      xirrResult = null
    }
  }

  return {
    totalCost,
    marketValue,
    cumulativeReturn,
    xirr: xirrResult,
    transactions,
  }
}

function yearsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00').getTime()
  const end = new Date(endDate + 'T00:00:00').getTime()
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000)
}
