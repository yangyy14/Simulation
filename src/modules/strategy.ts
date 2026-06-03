import { type IndexData } from './data-loader'
import { xirr } from './xirr'
import { computeMultiplier, type SmartConfig } from './valuator'
import { computeStockWeight, type L2Config } from './l2-allocator'
import { getAssetCategory } from '../App'

export type Frequency = 'monthly' | 'weekly'
export type AmountMode = 'fixed' | 'smart'

export interface Allocation {
  indexName: string
  weight: number          // 0-1, all weights should sum to ~1
  amountMode?: AmountMode // default 'fixed'
  smartConfig?: SmartConfig
}

export interface Segment {
  indexName: string
  frequency: Frequency
  day: number // 1-28 for monthly, 0-6 for weekly (0=Sun)
  amount: number // gross investment per period (before fees). fixed=actual, smart=base
  amountMode?: AmountMode // default 'fixed'
  smartConfig?: SmartConfig // only used when amountMode='smart'
  allocations?: Allocation[] // non-empty = portfolio mode
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
  l2Config?: L2Config
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
  maxDrawdown: number | null       // 最大回撤 (0-1)
  annualVolatility: number | null  // 年化波动率 (0-1)
  calmarRatio: number | null       // 收益/回撤比
  longestDrawdownDays: number      // 最长回撤天数
}

export function validateStrategy(
  strategy: Strategy,
  availableIndices: string[],
): string | null {
  if (strategy.segments.length === 0) return null

  for (let i = 0; i < strategy.segments.length; i++) {
    const s = strategy.segments[i]
    const isPortfolio = s.allocations && s.allocations.length > 0

    if (isPortfolio) {
      // Portfolio mode validations
      if (s.allocations!.length < 2) {
        return `片段 #${i + 1}: 组合模式至少需要 2 个指数`
      }
      if (s.allocations!.length > 10) {
        return `片段 #${i + 1}: 组合模式最多支持 10 个指数`
      }
      const sum = s.allocations!.reduce((acc, a) => acc + a.weight, 0)
      if (sum < 0.98 || sum > 1.02) {
        return `片段 #${i + 1}: 权重之和必须接近 100%（当前 ${(sum * 100).toFixed(1)}%）`
      }
      for (let j = 0; j < s.allocations!.length; j++) {
        const a = s.allocations![j]
        if (!availableIndices.includes(a.indexName)) {
          return `片段 #${i + 1}: 指数 "${a.indexName}" 不可用`
        }
        if (a.weight <= 0 || a.weight > 1) {
          return `片段 #${i + 1}: 权重必须在 0-1 之间`
        }
        if (a.amountMode === 'smart') {
          if (!a.smartConfig) {
            return `片段 #${i + 1}: 指数 "${a.indexName}" 智能定投模式必须配置估值参数`
          }
          if (a.smartConfig.lookbackYears < 1) {
            return `片段 #${i + 1}: 指数 "${a.indexName}" 回溯年数至少为 1`
          }
          if (a.smartConfig.cheapPercentile >= a.smartConfig.expensivePercentile) {
            return `片段 #${i + 1}: 指数 "${a.indexName}" 便宜阈值必须小于昂贵阈值`
          }
        }
      }
    } else {
      // Single index mode validations (existing)
      if (!availableIndices.includes(s.indexName)) {
        return `片段 #${i + 1}: 指数 "${s.indexName}" 不可用`
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

    // Shared validations
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
    const dates = generateInvestDates(segment)
    const isPortfolio = segment.allocations && segment.allocations.length > 0

    if (isPortfolio) {
      for (const date of dates) {
        // ── L2: dynamic stock/bond weight adjustment ──
        const allocs = segment.allocations!
        const aStockAllocs = allocs.filter((a) => {
          const cat = getAssetCategory(a.indexName)
          return cat.category === 'stock' && cat.subCategory === 'a-stock'
        })
        const bondAllocs = allocs.filter((a) => getAssetCategory(a.indexName).category === 'bond')
        const otherAllocs = allocs.filter((a) => {
          const cat = getAssetCategory(a.indexName)
          return !(cat.category === 'stock' && cat.subCategory === 'a-stock') && cat.category !== 'bond'
        })

        const staticStockW = aStockAllocs.reduce((s, a) => s + a.weight, 0)
        const staticBondW = bondAllocs.reduce((s, a) => s + a.weight, 0)

        let adjStockW = staticStockW
        let adjBondW = staticBondW

        if (strategy.l2Config && staticStockW > 0 && staticBondW > 0 && aStockAllocs.length > 0) {
          // Choose benchmark indices: largest A-stock by weight, first bond (prefer 3-5y)
          const stockIdx = aStockAllocs.reduce((best, a) => a.weight > best.weight ? a : best).indexName
          const bondIdx = bondAllocs.find((a) => a.indexName.includes('3-5'))?.indexName || bondAllocs[0]!.indexName

          const stockData = priceMap.get(stockIdx)
          const bondData = priceMap.get(bondIdx)
          if (stockData && bondData) {
            const l2Result = computeStockWeight(stockData, bondData, date, staticStockW, strategy.l2Config)
            if (l2Result) {
              adjStockW = l2Result.stockWeight
              adjBondW = 1 - adjStockW - otherAllocs.reduce((s, a) => s + a.weight, 0)
              if (adjBondW < 0) { adjBondW = 0; adjStockW = 1 - otherAllocs.reduce((s, a) => s + a.weight, 0) }
            }
          }
        }

        // ── Generate transactions with L2-adjusted weights ──
        const totalAmount = segment.amount
        for (const alloc of allocs) {
          const series = priceMap.get(alloc.indexName)
          if (!series) continue
          const price = series.getPrice(date)
          if (price === null) continue

          // Determine which pool this allocation belongs to
          const cat = getAssetCategory(alloc.indexName)
          const isABond = cat.category === 'bond'
          const isAStock = cat.category === 'stock' && cat.subCategory === 'a-stock'

          // Effective weight: for A-stock/bond, use adjusted ratio; others use static
          let effectiveWeight: number
          if (isAStock && staticStockW > 0) {
            effectiveWeight = adjStockW * (alloc.weight / staticStockW)
          } else if (isABond && staticBondW > 0) {
            effectiveWeight = adjBondW * (alloc.weight / staticBondW)
          } else {
            effectiveWeight = alloc.weight
          }

          let multiplier = 1.0
          if (alloc.amountMode === 'smart' && alloc.smartConfig) {
            multiplier = computeMultiplier(series, date, alloc.smartConfig)
          }
          const grossAmount = totalAmount * effectiveWeight * multiplier
          const netAmount = grossAmount * (1 - strategy.fees.purchaseFee)
          const shares = netAmount / price
          transactions.push({
            date,
            indexName: alloc.indexName,
            price,
            shares,
            grossAmount,
          })
        }
      }
    } else {
      const series = priceMap.get(segment.indexName)
      if (!series) continue

      for (const date of dates) {
        const price = series.getPrice(date)
        if (price === null) continue

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

  const risk = computeRiskMetrics(transactions, priceMap, evalEnd)

  return {
    totalCost,
    marketValue,
    cumulativeReturn,
    xirr: xirrResult,
    transactions,
    ...risk,
  }
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00').getTime()
  const end = new Date(endDate + 'T00:00:00').getTime()
  return (end - start) / (24 * 60 * 60 * 1000)
}

function yearsBetween(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) / 365.25
}

function computeRiskMetrics(
  transactions: Transaction[],
  priceMap: Map<string, IndexData>,
  evalEnd: string,
): Pick<PortfolioSummary, 'maxDrawdown' | 'annualVolatility' | 'calmarRatio' | 'longestDrawdownDays'> {
  if (transactions.length === 0) {
    return { maxDrawdown: null, annualVolatility: null, calmarRatio: null, longestDrawdownDays: 0 }
  }

  // Build daily MV sequence at each transaction date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const shareAcc: Record<string, number> = {}
  const mvSeries: { date: string; mv: number; cost: number }[] = []
  let runningCost = 0

  for (const tx of sorted) {
    runningCost += tx.grossAmount
    shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares
    let mv = 0
    for (const [idxName, shares] of Object.entries(shareAcc)) {
      const series = priceMap.get(idxName)
      if (!series) continue
      const price = series.getPrice(tx.date)
      if (price !== null) mv += shares * price
    }
    if (mv > 0) {
      mvSeries.push({ date: tx.date, mv, cost: runningCost })
    }
  }

  if (mvSeries.length < 2) {
    return { maxDrawdown: null, annualVolatility: null, calmarRatio: null, longestDrawdownDays: 0 }
  }

  // Max drawdown
  let peak = mvSeries[0].mv
  let maxDD = 0
  for (const pt of mvSeries) {
    if (pt.mv > peak) peak = pt.mv
    const dd = (peak - pt.mv) / peak
    if (dd > maxDD) maxDD = dd
  }

  // Annualized volatility from portfolio MV, stripping out new contributions.
  let annualVol: number | null = null
  if (mvSeries.length >= 2) {
    const returns: number[] = []
    for (let i = 1; i < mvSeries.length; i++) {
      const contribution = mvSeries[i].cost - mvSeries[i - 1].cost
      const prevMV = mvSeries[i - 1].mv
      // Organic return: MV growth excluding newly invested money
      if (prevMV > 0) {
        returns.push((mvSeries[i].mv - contribution) / prevMV - 1)
      }
    }
    if (returns.length > 0) {
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
      const avgDays = (new Date(mvSeries[mvSeries.length - 1].date).getTime() -
                       new Date(mvSeries[0].date).getTime()) / (24 * 60 * 60 * 1000) / (mvSeries.length - 1)
      const periodsPerYear = 365.25 / Math.max(avgDays, 1)
      annualVol = Math.sqrt(variance) * Math.sqrt(periodsPerYear)
    }
  }

  // Calmar ratio = cumulativeReturn / maxDrawdown (total return, not annualized)
  const lastMV = mvSeries[mvSeries.length - 1].mv
  const lastCost = mvSeries[mvSeries.length - 1].cost
  const totalRet = lastCost > 0 ? (lastMV - lastCost) / lastCost : 0
  const calmar = maxDD > 0 ? totalRet / maxDD : null

  // Longest drawdown days (market value < cost)
  let longest = 0
  let current = 0
  for (const pt of mvSeries) {
    if (pt.mv < pt.cost) {
      current++
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }

  return {
    maxDrawdown: maxDD > 0 ? maxDD : null,
    annualVolatility: annualVol,
    calmarRatio: calmar,
    longestDrawdownDays: longest,
  }
}
