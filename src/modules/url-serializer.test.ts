import { describe, it, expect, beforeEach } from 'vitest'
import { encodeStrategy, decodeStrategy, hasStrategyInURL } from './url-serializer'
import type { Strategy } from './strategy'

function makeStrategy(): Strategy {
  return {
    segments: [
      { indexName: '沪深300全收益', frequency: 'monthly', day: 1, amount: 1000, startDate: '2020-01-01', endDate: '2025-12-31' },
      { indexName: '中证500全收益', frequency: 'weekly', day: 1, amount: 2000, startDate: '2018-06-01', endDate: '2025-12-31' },
    ],
    fees: { purchaseFee: 0.0015, redemptionFee: 0.005, managementFee: 0.01 },
    evalWindow: { startDate: '2018-01-01', endDate: '2025-12-31' },
  }
}

describe('encodeStrategy / decodeStrategy', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('round-trips a strategy', () => {
    const original = makeStrategy()
    const url = encodeStrategy(original)
    // Set the URL so decodeStrategy can read it
    window.history.replaceState({}, '', url)
    const decoded = decodeStrategy()
    expect(decoded).not.toBeNull()
    expect(decoded!.segments.length).toBe(2)
    expect(decoded!.segments[0]).toEqual(original.segments[0])
    expect(decoded!.segments[1]).toEqual(original.segments[1])
    expect(decoded!.fees).toEqual(original.fees)
    expect(decoded!.evalWindow).toEqual(original.evalWindow)
  })

  it('round-trips a single-segment strategy', () => {
    const original: Strategy = {
      segments: [{ indexName: 'AU9999', frequency: 'monthly', day: 15, amount: 500, startDate: '2020-01-01', endDate: '2021-01-01' }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2021-06-01' },
    }
    const url = encodeStrategy(original)
    window.history.replaceState({}, '', url)
    const decoded = decodeStrategy()
    expect(decoded).not.toBeNull()
    expect(decoded!.segments[0]).toEqual(original.segments[0])
  })

  it('round-trips a strategy with no segments', () => {
    const original: Strategy = {
      segments: [],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2020-01-01', endDate: '2025-12-31' },
    }
    const url = encodeStrategy(original)
    window.history.replaceState({}, '', url)
    const decoded = decodeStrategy()
    expect(decoded).not.toBeNull()
    expect(decoded!.segments).toEqual([])
  })

  it('returns null when URL has no strategy', () => {
    window.history.replaceState({}, '', '/')
    expect(decodeStrategy()).toBeNull()
  })

  it('returns null for corrupted data', () => {
    window.history.replaceState({}, '', '/?s=not-valid-base64!!!')
    expect(decodeStrategy()).toBeNull()
  })

  it('hasStrategyInURL detects strategy param', () => {
    window.history.replaceState({}, '', '/')
    expect(hasStrategyInURL()).toBe(false)
    window.history.replaceState({}, '', '/?s=abc123')
    expect(hasStrategyInURL()).toBe(true)
  })

  it('encoded URL is compact enough', () => {
    const url = encodeStrategy(makeStrategy())
    const params = new URL(url).searchParams
    const s = params.get('s')!
    // ~500 bytes for 2-segment strategy
    expect(s.length).toBeLessThan(800)
  })
})
