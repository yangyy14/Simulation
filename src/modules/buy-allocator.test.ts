import { describe, it, expect } from 'vitest'
import { allocateBuy } from './buy-allocator'

describe('allocateBuy', () => {
  it('fills needs exactly when gaps are smaller than invest amount', () => {
    // Stock 5200 (52%), Bond 4800 (48%), invest 1000
    // Post total = 11000, stock target = 5500 (need 300), bond target = 5500 (need 700)
    const categories = [
      { name: 'stock', marketValue: 5200, targetWeight: 0.5 },
      { name: 'bond', marketValue: 4800, targetWeight: 0.5 },
    ]

    const result = allocateBuy(categories, 1000)

    expect(result.get('stock')).toBeCloseTo(300, 0)
    expect(result.get('bond')).toBeCloseTo(700, 0)
  })

  it('gives all to underweight when gap exceeds invest amount', () => {
    // Stock 7000 (70%), Bond 3000 (30%), invest 1000
    // Post total = 11000, stock target = 5500 (need 0), bond target = 5500 (need 2500)
    // Total needed = 2500 > 1000 → scale: bond gets 1000
    const categories = [
      { name: 'stock', marketValue: 7000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 3000, targetWeight: 0.5 },
    ]

    const result = allocateBuy(categories, 1000)

    expect(result.get('stock')).toBeCloseTo(0, 0)
    expect(result.get('bond')).toBeCloseTo(1000, 0)
  })

  it('allocates by target weight on fresh start', () => {
    const categories = [
      { name: 'stock', marketValue: 0, targetWeight: 0.5 },
      { name: 'bond', marketValue: 0, targetWeight: 0.3 },
      { name: 'gold', marketValue: 0, targetWeight: 0.2 },
    ]

    const result = allocateBuy(categories, 1000)

    expect(result.get('stock')).toBeCloseTo(500, 0)
    expect(result.get('bond')).toBeCloseTo(300, 0)
    expect(result.get('gold')).toBeCloseTo(200, 0)
  })

  it('scales down proportionally when multiple categories need more than available', () => {
    // Stock 1000 (10%), Bond 1000 (10%), Gold 8000 (80%), invest 1000
    // Post total = 11000
    // Stock target = 5500 (need 4500), Bond target = 3300 (need 2300), Gold target = 2200 (need 0)
    // Total needed = 6800 > 1000 → scale
    // Stock: 1000 × 4500/6800 ≈ 662, Bond: 1000 × 2300/6800 ≈ 338
    const categories = [
      { name: 'stock', marketValue: 1000, targetWeight: 0.5 },
      { name: 'bond', marketValue: 1000, targetWeight: 0.3 },
      { name: 'gold', marketValue: 8000, targetWeight: 0.2 },
    ]

    const result = allocateBuy(categories, 1000)

    expect(result.get('gold')).toBeCloseTo(0, 0)
    expect(result.get('stock')).toBeCloseTo(662, 0)
    expect(result.get('bond')).toBeCloseTo(338, 0)
  })
})
