export interface CategoryAlloc {
  name: string
  marketValue: number
  targetWeight: number
}

export function allocateBuy(
  categories: CategoryAlloc[],
  totalAmount: number,
): Map<string, number> {
  const totalMV = categories.reduce((s, c) => s + c.marketValue, 0)
  const result = new Map<string, number>()

  // Compute gaps (ignore near-zero gaps from floating point)
  const EPS = 1e-6
  const gaps = categories.map(c => {
    const raw = c.targetWeight * totalMV - c.marketValue
    return { name: c.name, gap: Math.abs(raw) < EPS ? 0 : raw }
  })

  // Only allocate to underweight (positive gap)
  const positiveGaps = gaps.filter(g => g.gap > 0)
  const totalGap = positiveGaps.reduce((s, g) => s + g.gap, 0)

  for (const c of categories) {
    const g = gaps.find(g => g.name === c.name)!
    if (g.gap > 0 && totalGap > 0) {
      result.set(c.name, totalAmount * (g.gap / totalGap))
    } else if (totalGap === 0) {
      // No underweight categories → fall back to target weight
      result.set(c.name, totalAmount * c.targetWeight)
    } else {
      result.set(c.name, 0)
    }
  }

  return result
}
