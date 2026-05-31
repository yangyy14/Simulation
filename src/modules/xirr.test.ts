import { describe, it, expect } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('calculates simple one-year return ~10%', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2025-01-01', amount: 1100 },
    ])
    expect(r).toBeCloseTo(0.1, 3)
  })

  it('calculates from earlier example (~20.5%)', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-07-01', amount: -1000 },
      { date: '2025-01-01', amount: 2300 },
    ])
    expect(r).toBeCloseTo(0.205, 2)
  })

  it('returns ~0% for zero growth over one year', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2025-01-01', amount: 1000 },
    ])
    expect(r).toBeCloseTo(0, 3)
  })

  it('handles multi-year negative return', () => {
    const r = xirr([
      { date: '2020-01-01', amount: -1000 },
      { date: '2023-01-01', amount: 800 },
    ])
    expect(r).toBeLessThan(0)
  })

  it('throws on empty cashflows', () => {
    expect(() => xirr([])).toThrow('at least 2')
  })

  it('throws on single cashflow', () => {
    expect(() => xirr([{ date: '2024-01-01', amount: -1000 }])).toThrow(
      'at least 2',
    )
  })

  it('throws when all amounts are same sign (negative)', () => {
    expect(() =>
      xirr([
        { date: '2024-01-01', amount: -1000 },
        { date: '2024-02-01', amount: -500 },
      ]),
    ).toThrow('positive and negative')
  })

  it('throws when all amounts are same sign (positive)', () => {
    expect(() =>
      xirr([
        { date: '2024-01-01', amount: 1000 },
        { date: '2024-02-01', amount: 500 },
      ]),
    ).toThrow('positive and negative')
  })
})
