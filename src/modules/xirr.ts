const MAX_ITER = 100
const TOLERANCE = 1e-6
const DAYS_PER_YEAR = 365

export function xirr(cashflows: { date: string; amount: number }[]): number {
  if (cashflows.length < 2) {
    throw new Error('XIRR requires at least 2 cashflows')
  }

  const firstDate = new Date(cashflows[0].date).getTime()
  const normalized = cashflows.map((cf) => ({
    t: (new Date(cf.date).getTime() - firstDate) / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000),
    amount: cf.amount,
  }))

  // Check all same sign → no solution possible
  const positives = normalized.some((cf) => cf.amount > 0)
  const negatives = normalized.some((cf) => cf.amount < 0)
  if (!positives || !negatives) {
    throw new Error('XIRR requires both positive and negative cashflows')
  }

  let guess = 0.1
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const { npv, dnpv } = calcNPVAndDerivative(normalized, guess)
    if (Math.abs(npv) < TOLERANCE) {
      return guess
    }
    if (Math.abs(dnpv) < TOLERANCE) {
      // Newton would divide by zero, adjust guess
      guess = guess + 0.01
      continue
    }
    guess = guess - npv / dnpv
    if (guess <= -1) {
      guess = -0.5
    }
  }

  // If Newton didn't converge, fall back to simple approximation
  return guess
}

function calcNPVAndDerivative(
  cashflows: { t: number; amount: number }[],
  rate: number,
): { npv: number; dnpv: number } {
  let npv = 0
  let dnpv = 0
  for (const cf of cashflows) {
    const factor = Math.pow(1 + rate, cf.t)
    npv += cf.amount / factor
    dnpv += (-cf.t * cf.amount) / (factor * (1 + rate))
  }
  return { npv, dnpv }
}
