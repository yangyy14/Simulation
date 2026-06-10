import { type IndexData } from './data-loader'
import { xirr } from './xirr'
import { computeMultiplier, type SmartConfig } from './valuator'
import { allocateBuy, type CategoryAlloc } from './buy-allocator'
import { evaluateRebalance } from './rebalancer-v2'
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
  day: number
  amount: number
  amountMode?: AmountMode
  smartConfig?: SmartConfig
  allocations?: Allocation[]
  dynamicBuy?: boolean  // default true
  rebalance?: boolean
  startDate: string
  endDate: string
}

export interface RebalanceConfig {
  deviationThreshold: number
  minIntervalMonths: number
  tradeCostRate: number
}

export interface Strategy {
  segments: Segment[]
  fees: {
    purchaseFee: number
    redemptionFee: number
    managementFee: number
  }
  evalWindow: {
    startDate: string
    endDate: string
  }
  rebalanceConfig?: RebalanceConfig
}

export interface Transaction {
  date: string
  indexName: string
  price: number
  shares: number
  grossAmount: number
  type: 'buy' | 'sell'
  source: 'invest' | 'rebalance'
}

export interface PortfolioSummary {
  totalCost: number
  marketValue: number
  cumulativeReturn: number
  xirr: number | null
  transactions: Transaction[]
  maxDrawdown: number | null
  annualVolatility: number | null
  calmarRatio: number | null
  longestDrawdownDays: number
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
      // Segment-level share accumulator for dynamic buy allocation
      const segShares: Record<string, number> = {}
      const allocs = segment.allocations!
      const totalAmount = segment.amount

      // Pre-classify allocations into categories
      const catWeights = new Map<string, number>() // category → total static weight
      const catIndices = new Map<string, Allocation[]>() // category → allocations
      for (const alloc of allocs) {
        const cat = getAssetCategory(alloc.indexName)
        const catKey = cat.category // 'stock' | 'bond' | 'gold'
        catWeights.set(catKey, (catWeights.get(catKey) || 0) + alloc.weight)
        if (!catIndices.has(catKey)) catIndices.set(catKey, [])
        catIndices.get(catKey)!.push(alloc)
      }

      let lastRebalanceDate: string | null = null

      for (const date of dates) {
        // ── 1. Rebalance first: correct past drift before new money goes in ──
        if (segment.rebalance && strategy.rebalanceConfig) {
          const preCats: CategoryAlloc[] = []
          for (const [catKey, catWeight] of catWeights) {
            let mv = 0
            for (const alloc of catIndices.get(catKey) || []) {
              const shares = segShares[alloc.indexName] || 0
              const series = priceMap.get(alloc.indexName)
              if (series) {
                const price = series.getPrice(date)
                if (price !== null) mv += shares * price
              }
            }
            preCats.push({ name: catKey, marketValue: mv, targetWeight: catWeight })
          }

          const rbResult = evaluateRebalance(preCats, date, strategy.rebalanceConfig, lastRebalanceDate)
          if (rbResult) {
            lastRebalanceDate = date

            // Index-level execution: compute each index's deviation from its own
            // static target weight and correct individually. Overweight → sell,
            // underweight → buy from the sell pool (after trade cost).
            const idxStates: { alloc: Allocation; mv: number; price: number }[] = []
            let totalMV = 0
            for (const alloc of allocs) {
              const series = priceMap.get(alloc.indexName)
              if (!series) continue
              const price = series.getPrice(date)
              if (price === null) continue
              const mv = (segShares[alloc.indexName] || 0) * price
              totalMV += mv
              idxStates.push({ alloc, mv, price })
            }

            const toSell: { alloc: Allocation; amount: number; price: number }[] = []
            const toBuy: { alloc: Allocation; amount: number; price: number }[] = []

            for (const st of idxStates) {
              const targetMV = st.alloc.weight * totalMV
              const diff = st.mv - targetMV
              if (diff > 0) {
                toSell.push({ alloc: st.alloc, amount: diff, price: st.price })
              } else if (diff < 0) {
                toBuy.push({ alloc: st.alloc, amount: -diff, price: st.price })
              }
            }

            const totalSell = toSell.reduce((s, x) => s + x.amount, 0)
            const buyPool = totalSell * (1 - strategy.rebalanceConfig.tradeCostRate)
            const totalNeed = toBuy.reduce((s, x) => s + x.amount, 0)

            for (const sell of toSell) {
              const shares = sell.amount / sell.price
              segShares[sell.alloc.indexName] = (segShares[sell.alloc.indexName] || 0) - shares
              transactions.push({
                date, indexName: sell.alloc.indexName, price: sell.price, shares,
                grossAmount: sell.amount, type: 'sell', source: 'rebalance',
              })
            }

            for (const buy of toBuy) {
              if (totalNeed <= 0) continue
              const scale = Math.min(buyPool / totalNeed, 1)
              const buyAmount = buy.amount * scale
              const shares = buyAmount / buy.price
              segShares[buy.alloc.indexName] = (segShares[buy.alloc.indexName] || 0) + shares
              transactions.push({
                date, indexName: buy.alloc.indexName, price: buy.price, shares,
                grossAmount: buyAmount, type: 'buy', source: 'rebalance',
              })
            }
          }
        }

        // ── 2. Then buy: dynamic allocation into a (now-balanced) portfolio ──
        const cats: CategoryAlloc[] = []
        for (const [catKey, catWeight] of catWeights) {
          let mv = 0
          for (const alloc of catIndices.get(catKey) || []) {
            const shares = segShares[alloc.indexName] || 0
            const series = priceMap.get(alloc.indexName)
            if (series) {
              const price = series.getPrice(date)
              if (price !== null) mv += shares * price
            }
          }
          cats.push({ name: catKey, marketValue: mv, targetWeight: catWeight })
        }

        // Dynamic buy: gap-based + static blend, or pure static if disabled
        const useDynamic = segment.dynamicBuy !== false // default true
        const catAlloc = useDynamic
          ? allocateBuy(cats, totalAmount)
          : new Map([...catWeights.keys()].map(k => [k, totalAmount * (catWeights.get(k) || 0)] as const))

        for (const [catKey, catAmount] of catAlloc) {
          if (catAmount <= 0) continue
          const indices = catIndices.get(catKey) || []
          const catTotalWeight = catWeights.get(catKey) || 1

          // Build per-index allocation data for intra-category dynamic buy
          const idxCats: CategoryAlloc[] = []
          for (const alloc of indices) {
            const shares = segShares[alloc.indexName] || 0
            const series = priceMap.get(alloc.indexName)
            let mv = 0
            if (series) {
              const price = series.getPrice(date)
              if (price !== null) mv = shares * price
            }
            // Normalize weight within the category
            idxCats.push({ name: alloc.indexName, marketValue: mv, targetWeight: alloc.weight / catTotalWeight })
          }

          const idxAlloc = useDynamic
            ? allocateBuy(idxCats, catAmount)
            : new Map(indices.map(a => [a.indexName, catAmount * (a.weight / catTotalWeight)] as const))

          for (const alloc of indices) {
            const idxAmount = idxAlloc.get(alloc.indexName) || 0
            if (idxAmount <= 0) continue
            const series = priceMap.get(alloc.indexName)
            if (!series) continue
            const price = series.getPrice(date)
            if (price === null) continue

            let multiplier = 1.0
            if (alloc.amountMode === 'smart' && alloc.smartConfig) {
              multiplier = computeMultiplier(series, date, alloc.smartConfig)
            }
            const grossAmount = idxAmount * multiplier
            const netAmount = grossAmount * (1 - strategy.fees.purchaseFee)
            const shares = netAmount / price
            segShares[alloc.indexName] = (segShares[alloc.indexName] || 0) + shares
            transactions.push({
              date, indexName: alloc.indexName, price, shares,
              grossAmount, type: 'buy', source: 'invest',
            })
          }
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
          type: 'buy',
          source: 'invest',
        })
      }
    }
  }

  const evalEnd = strategy.evalWindow.endDate
  let totalCost = 0

  // FIFO lot tracker: each buy (invest or rebalance) adds a lot; sells consume
  // the oldest lots first. This preserves purchase dates so management fees are
  // correctly applied to the actual shares still held at evalEnd.
  interface Lot { date: string; shares: number }
  const lots: Record<string, Lot[]> = {}
  for (const tx of transactions) {
    if (tx.source === 'invest') {
      totalCost += tx.grossAmount
    }
    if (tx.type === 'buy') {
      if (!lots[tx.indexName]) lots[tx.indexName] = []
      lots[tx.indexName].push({ date: tx.date, shares: tx.shares })
    } else {
      let remaining = tx.shares
      const idxLots = lots[tx.indexName] || []
      while (remaining > 0 && idxLots.length > 0) {
        if (idxLots[0].shares <= remaining) {
          remaining -= idxLots[0].shares
          idxLots.shift()
        } else {
          idxLots[0].shares -= remaining
          remaining = 0
        }
      }
    }
  }

  let marketValue = 0
  const evalEndTime = new Date(evalEnd + 'T00:00:00').getTime()
  for (const [idxName, idxLots] of Object.entries(lots)) {
    const series = priceMap.get(idxName)
    const price = series?.getPrice(evalEnd)
    if (price === null || price === undefined) continue
    for (const lot of idxLots) {
      const lotTime = new Date(lot.date + 'T00:00:00').getTime()
      const holdingYears = (evalEndTime - lotTime) / (24 * 60 * 60 * 1000) / 365.25
      const mgmtFactor = Math.pow(1 - strategy.fees.managementFee, holdingYears)
      marketValue += lot.shares * price * mgmtFactor
    }
  }

  marketValue *= 1 - strategy.fees.redemptionFee

  const cumulativeReturn = totalCost > 0 ? (marketValue - totalCost) / totalCost : 0

  const cashflows: { date: string; amount: number }[] = []
  for (const tx of transactions) {
    if (tx.source === 'invest') {
      cashflows.push({ date: tx.date, amount: -tx.grossAmount })
    }
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

function computeRiskMetrics(
  transactions: Transaction[],
  priceMap: Map<string, IndexData>,
  evalEnd: string,
): Pick<PortfolioSummary, 'maxDrawdown' | 'annualVolatility' | 'calmarRatio' | 'longestDrawdownDays'> {
  if (transactions.length === 0) {
    return { maxDrawdown: null, annualVolatility: null, calmarRatio: null, longestDrawdownDays: 0 }
  }

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const shareAcc: Record<string, number> = {}
  const mvSeries: { date: string; mv: number; cost: number }[] = []
  let runningCost = 0

  for (const tx of sorted) {
    if (tx.source === 'invest') runningCost += tx.grossAmount
    if (tx.type === 'buy') {
      shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares
    } else {
      shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) - tx.shares
    }
    let mv = 0
    for (const [idxName, shares] of Object.entries(shareAcc)) {
      const series = priceMap.get(idxName)
      if (!series) continue
      const price = series.getPrice(tx.date)
      if (price !== null) mv += shares * price
    }
    if (mv > 0) {
      // Deduplicate by date: keep only the final state per date.
      // This prevents rebalance sell transactions from creating
      // artificial MV dips (cash from sells is not tracked in MV).
      const last = mvSeries[mvSeries.length - 1]
      if (last && last.date === tx.date) {
        mvSeries[mvSeries.length - 1] = { date: tx.date, mv, cost: runningCost }
      } else {
        mvSeries.push({ date: tx.date, mv, cost: runningCost })
      }
    }
  }

  if (mvSeries.length < 2) {
    return { maxDrawdown: null, annualVolatility: null, calmarRatio: null, longestDrawdownDays: 0 }
  }

  let peak = mvSeries[0].mv
  let maxDD = 0
  for (const pt of mvSeries) {
    if (pt.mv > peak) peak = pt.mv
    const dd = (peak - pt.mv) / peak
    if (dd > maxDD) maxDD = dd
  }

  let annualVol: number | null = null
  if (mvSeries.length >= 2) {
    const returns: number[] = []
    for (let i = 1; i < mvSeries.length; i++) {
      const contribution = mvSeries[i].cost - mvSeries[i - 1].cost
      const prevMV = mvSeries[i - 1].mv
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

  const lastMV = mvSeries[mvSeries.length - 1].mv
  const lastCost = mvSeries[mvSeries.length - 1].cost
  const totalRet = lastCost > 0 ? (lastMV - lastCost) / lastCost : 0
  const calmar = maxDD > 0 ? totalRet / maxDD : null

  let longest = 0
  let streakStart: string | null = null
  for (const pt of mvSeries) {
    if (pt.mv < pt.cost) {
      if (!streakStart) streakStart = pt.date
      const days = Math.max(15, Math.round(
        (new Date(pt.date + 'T00:00:00').getTime() -
         new Date(streakStart + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000)
      ))
      if (days > longest) longest = days
    } else {
      streakStart = null
    }
  }

  return {
    maxDrawdown: maxDD > 0 ? maxDD : null,
    annualVolatility: annualVol,
    calmarRatio: calmar,
    longestDrawdownDays: longest,
  }
}
