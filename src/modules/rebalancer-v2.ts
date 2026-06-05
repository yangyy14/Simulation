export interface RebalanceConfig {
  deviationThreshold: number
  minIntervalMonths: number
  tradeCostRate: number
}

export interface CatHolding {
  name: string
  marketValue: number
  targetWeight: number
}

export interface RebalanceResult {
  trigger: 'deviation'
  sells: { name: string; amount: number }[]
  buys: { name: string; amount: number }[]
  totalCost: number
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by! - ay!) * 12 + (bm! - am!)
}

export function evaluateRebalance(
  cats: CatHolding[],
  targetDate: string,
  config: RebalanceConfig,
  lastRebalanceDate: string | null,
): RebalanceResult | null {
  const totalMV = cats.reduce((s, c) => s + c.marketValue, 0)
  if (totalMV === 0) return null

  // Check if any category deviates above threshold
  let maxDeviation = 0
  for (const c of cats) {
    const actual = c.marketValue / totalMV
    const deviation = Math.abs(actual - c.targetWeight)
    if (deviation > maxDeviation) maxDeviation = deviation
  }

  if (maxDeviation <= config.deviationThreshold) return null

  if (lastRebalanceDate) {
    const monthsSince = monthsBetween(lastRebalanceDate, targetDate)
    if (monthsSince < config.minIntervalMonths) return null
  }

  // Sell overweight portion of each overweight category
  const sells: RebalanceResult['sells'] = []
  let totalSell = 0
  for (const c of cats) {
    const targetMV = c.targetWeight * totalMV
    if (c.marketValue > targetMV) {
      const sellAmount = c.marketValue - targetMV
      sells.push({ name: c.name, amount: sellAmount })
      totalSell += sellAmount
    }
  }

  // Buy underweight categories by target weight ratio
  const buyPool = totalSell * (1 - config.tradeCostRate)
  const buys: RebalanceResult['buys'] = []
  let totalUnderWeight = 0
  for (const c of cats) {
    const targetMV = c.targetWeight * totalMV
    if (c.marketValue < targetMV) {
      totalUnderWeight += c.targetWeight
    }
  }

  for (const c of cats) {
    const targetMV = c.targetWeight * totalMV
    if (c.marketValue < targetMV && totalUnderWeight > 0) {
      buys.push({ name: c.name, amount: buyPool * (c.targetWeight / totalUnderWeight) })
    }
  }

  return { trigger: 'deviation', sells, buys, totalCost: totalSell - buyPool }
}
