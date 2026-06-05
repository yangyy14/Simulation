import { describe, it, expect } from 'vitest'
import { allocateBuy } from './buy-allocator'

describe('allocateBuy', () => {
  it('allocates proportionally to underweight categories by gap size', () => {
    // Stock: 65000 (65%) target 50% → gap = 50000-65000 = -15000 (over)
    // Bond:  25000 (25%) target 30% → gap = 30000-25000 = +5000 (under)
    // Gold:  10000 (10%) target 20% → gap = 20000-10000 = +10000 (under)
    const categories = [
      { name: 'stock', marketValue: 65000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 25000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 10000, targetWeight: 0.2 },
    ]

    const result = allocateBuy(categories, 1000)

    // Stock gets 0 (overweight). Bond and gold split 1000 by gap ratio 5000:10000 = 1:2
    expect(result.get('stock')).toBeCloseTo(0, 0)
    expect(result.get('bond')).toBeCloseTo(333.33, 0)
    expect(result.get('gold')).toBeCloseTo(666.67, 0)
  })

  it('allocates by target weight when all categories are underweight', () => {
    // Fresh start: all MV are 0 or very small, all under target
    const categories = [
      { name: 'stock', marketValue: 0, targetWeight: 0.5 },
      { name: 'bond', marketValue: 0, targetWeight: 0.3 },
      { name: 'gold', marketValue: 0, targetWeight: 0.2 },
    ]

    const result = allocateBuy(categories, 1000)

    // When all MV=0, gaps are targetWeight * 0 - 0 = 0 for all
    // No positive gaps → should then fall back to targetWeight
    expect(result.get('stock')).toBeCloseTo(500, 0)
    expect(result.get('bond')).toBeCloseTo(300, 0)
    expect(result.get('gold')).toBeCloseTo(200, 0)
  })

  it('falls back to target weight when perfectly balanced (no gaps)', () => {
    // All categories exactly at target → no gaps
    const categories = [
      { name: 'stock', marketValue: 500, targetWeight: 0.5 },
      { name: 'bond', marketValue: 300, targetWeight: 0.3 },
      { name: 'gold', marketValue: 200, targetWeight: 0.2 },
    ]

    const result = allocateBuy(categories, 1000)

    // No gaps → fallback to target weight
    expect(result.get('stock')).toBeCloseTo(500, 0)
    expect(result.get('bond')).toBeCloseTo(300, 0)
    expect(result.get('gold')).toBeCloseTo(200, 0)
  })
})
