export interface CategoryAlloc {
  name: string
  marketValue: number
  targetWeight: number
}

/**
 * Allocate invest amount so the post-purchase portfolio is as close
 * to target weights as possible.
 *
 * Logic:
 * 1. postTotal = current total MV + investAmount
 * 2. For each category: targetPost = postTotal × targetWeight
 * 3. needed = max(0, targetPost − currentMV)
 * 4. If needed sum > investAmount: scale down proportionally
 * 5. If needed sum === 0: distribute by target weight
 * 6. Else: use needed amounts, distribute remainder by target weight
 */
export function allocateBuy(
  categories: CategoryAlloc[],
  totalAmount: number,
): Map<string, number> {
  const totalMV = categories.reduce((s, c) => s + c.marketValue, 0)
  const postTotal = totalMV + totalAmount

  // Compute how much each category needs to reach its post-purchase target
  const needed = categories.map(c => ({
    name: c.name,
    amount: Math.max(0, c.targetWeight * postTotal - c.marketValue),
    weight: c.targetWeight,
  }))

  const totalNeeded = needed.reduce((s, n) => s + n.amount, 0)
  const result = new Map<string, number>()

  if (totalNeeded <= 0) {
    // All categories already at or above target → fall back to target weight
    for (const n of needed) {
      result.set(n.name, totalAmount * n.weight)
    }
  } else if (totalNeeded <= totalAmount) {
    // We have enough money to fill all needs
    // Fill needs exactly, distribute remainder by target weight
    const remainder = totalAmount - totalNeeded
    for (const n of needed) {
      result.set(n.name, n.amount + remainder * n.weight)
    }
  } else {
    // Not enough money to fill all needs → scale down proportionally
    for (const n of needed) {
      result.set(n.name, totalAmount * (n.amount / totalNeeded))
    }
  }

  return result
}
