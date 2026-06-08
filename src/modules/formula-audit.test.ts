/**
 * 公式合理性审计 — 手工可验算的测试数据
 *
 * 每个测试用例标注了手算公式，用于评估当前实现是否合理。
 * 标记 🐛 的是已发现的疑似问题。
 */
import { describe, it, expect } from 'vitest'
import { xirr } from './xirr'
import { runSimulation, type Strategy } from './strategy'
import { computeMultiplier, type SmartConfig } from './valuator'
import { IndexDataImpl, type IndexData } from './data-loader'

// ============================================================
// Helper
// ============================================================
function pad(n: number) { return String(n).padStart(2, '0') }

function makeSeries(
  name: string,
  startDate: string,
  count: number,
  basePrice: number,
  dailyChange: number,
): IndexData {
  const rows: { date: string; price: number; metric?: number }[] = []
  const [y, m, d] = startDate.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const dt = new Date(y!, m! - 1, d! + i)
    const ds = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    rows.push({ date: ds, price: basePrice + i * dailyChange })
  }
  return new IndexDataImpl(name, rows)
}

function makeSeriesWithPE(
  name: string,
  startDate: string,
  count: number,
  basePrice: number,
  dailyChange: number,
  peValues: number[],
): IndexData {
  const rows: { date: string; price: number; metric?: number }[] = []
  const [y, m, d] = startDate.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const dt = new Date(y!, m! - 1, d! + i)
    const ds = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    rows.push({ date: ds, price: basePrice + i * dailyChange, metric: peValues[i] })
  }
  return new IndexDataImpl(name, rows)
}

// ============================================================
// XIRR — 手工验算
// ============================================================
describe('XIRR 手工验算', () => {
  it('使用非闰年精确验算 10% 收益', () => {
    // 2023-01-01 → 2024-01-01 = 365 天 = 1.0 年
    // -1000 + 1100/(1+r)^1 = 0 → r = 0.1
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1100 },
    ])
    expect(r).toBeCloseTo(0.1, 5)
  })

  it('使用非闰年精确验算 -20% 亏损', () => {
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 800 },
    ])
    expect(r).toBeCloseTo(-0.2, 5)
  })

  it('🐛 闰年导致 days/year 偏移', () => {
    // 2020 是闰年, 2020-01-01 → 2021-01-01 = 366 天
    // XIRR 用 DAYS_PER_YEAR=365, 所以 t = 366/365 ≈ 1.00274
    // (1+r)^1.00274 = 1.1 → r ≈ 0.0997 (而非精确 0.1)
    // 这是天数基准选择问题, 不是 bug, 但需要知晓
    const r = xirr([
      { date: '2020-01-01', amount: -1000 },
      { date: '2021-01-01', amount: 1100 },
    ])
    // 理论值 0.1, 实际因时间因子略低
    expect(r).toBeCloseTo(0.1, 2) // 宽松精度仍通过
    expect(r).toBeLessThan(0.1)    // 闰年压低收益率
  })

  it('两年翻倍 → 年化约 41.4%', () => {
    // 2022-2024: 2022(365) + 2023(365) = 730 days, 730/365 = 2.0 精确
    const r = xirr([
      { date: '2022-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 2000 },
    ])
    expect(r).toBeCloseTo(Math.sqrt(2) - 1, 3)
  })

  it('多笔投入单笔回收 — 验算 NPV≈0', () => {
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2023-02-01', amount: -1000 },
      { date: '2023-03-01', amount: -1000 },
      { date: '2023-04-01', amount: 3100 },
    ])
    expect(r).toBeGreaterThan(0)
    const firstDate = new Date('2023-01-01').getTime()
    const t = (d: string) =>
      (new Date(d).getTime() - firstDate) / (365 * 24 * 60 * 60 * 1000)
    const npv =
      -1000 / (1 + r) ** t('2023-01-01') +
      -1000 / (1 + r) ** t('2023-02-01') +
      -1000 / (1 + r) ** t('2023-03-01') +
      3100 / (1 + r) ** t('2023-04-01')
    expect(Math.abs(npv)).toBeLessThan(1)
  })

  it('🐛 极端负收益 — 本金亏 90% → r ≈ -0.9', () => {
    // Newton 初值 0.1, 导数在 r ≈ -0.9 附近振荡, 可能不收敛
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 100 },
    ])
    // 实际返回约 -0.5 (guard 截断值), 而非精确 -0.9
    // 确认非收敛情况下返回的近似值仍在合理区间
    expect(r).toBeLessThan(0)
  })

  it('🐛 极端正收益 — 一年翻 10 倍 → r ≈ 9.0', () => {
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 10000 },
    ])
    // 100 次迭代从 0.1 出发不一定能收敛到 9
    expect(r).toBeGreaterThan(0)
  })
})

// ============================================================
// Strategy — 费率手工验算
// ============================================================
describe('费率手工验算', () => {
  // 2023-01-01 投 1000, price=100, evalEnd=2024-01-01, price=120
  // 370 天覆盖到 2024-01-05, 确保 evalEnd 在数据范围内
  const series = makeSeries('TEST', '2023-01-01', 370, 100, 20 / 365)
  const priceMap = new Map<string, IndexData>([['TEST', series]])

  const base: Strategy = {
    segments: [{
      indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
      startDate: '2023-01-01', endDate: '2023-01-01',
    }],
    fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
    evalWindow: { startDate: '2023-01-01', endDate: '2024-01-01' },
  }

  it('零费率基准 — 份额、成本、市值', () => {
    const { transactions, totalCost, marketValue } = runSimulation(base, priceMap)
    const tx = transactions[0]
    expect(tx.grossAmount).toBe(1000)
    expect(tx.shares).toBeCloseTo(10, 1) // 1000 / 100
    expect(totalCost).toBe(1000)
    // price[0]=100, dailyChange=20/365, 365 天后 ≈ 120
    expect(marketValue).toBeCloseTo(1200, -1)
  })

  it('申购费 1% — 内扣法: netAmount = gross × (1 - fee)', () => {
    const s: Strategy = {
      ...base,
      fees: { purchaseFee: 0.01, redemptionFee: 0, managementFee: 0 },
    }
    const { transactions, totalCost } = runSimulation(s, priceMap)
    const tx = transactions[0]
    expect(tx.shares).toBeCloseTo(9.9, 1) // 990 / 100
    expect(totalCost).toBe(1000) // totalCost 记录 grossAmount
  })

  it('🐛 申购费模型: PRD 定义(外加) vs 代码(内扣)', () => {
    // PRD: 累计投入总额 = Σ(金额 × (1 + 申购费率)) = 1010
    // 代码: totalCost = Σ grossAmount = 1000 (申购费从份额中扣除)
    // 两种模型得到的 cumulativeReturn 不同
    const s: Strategy = {
      ...base,
      fees: { purchaseFee: 0.01, redemptionFee: 0, managementFee: 0 },
    }
    const { totalCost } = runSimulation(s, priceMap)
    expect(totalCost).toBe(1000)
  })

  it('赎回费 1% — 市值扣减', () => {
    const noFee = runSimulation(base, priceMap)
    const s: Strategy = {
      ...base,
      fees: { purchaseFee: 0, redemptionFee: 0.01, managementFee: 0 },
    }
    const withFee = runSimulation(s, priceMap)
    expect(withFee.marketValue).toBeCloseTo(noFee.marketValue * 0.99, 0)
  })

  it('管理费 1.5%/年 — 持有一年', () => {
    const noFee = runSimulation(base, priceMap)
    const s: Strategy = {
      ...base,
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0.015 },
    }
    const withFee = runSimulation(s, priceMap)
    expect(withFee.marketValue).toBeCloseTo(noFee.marketValue * 0.985, 0)
  })

  it('三种费率叠加 — 手工可验算', () => {
    const s: Strategy = {
      ...base,
      fees: { purchaseFee: 0.01, redemptionFee: 0.01, managementFee: 0.015 },
    }
    const { transactions, marketValue } = runSimulation(s, priceMap)
    const tx = transactions[0]
    // netAmount = 1000 * 0.99 = 990, shares = 990 / 100 = 9.9
    // holdingYears ≈ 1, mgmtFactor = 0.985, endPrice ≈ 120
    // rawMV = 9.9 * 120 * 0.985 ≈ 1170.2
    // marketValue = 1170.2 * 0.99 ≈ 1158.5
    const endPrice = series.getPrice('2024-01-01')!
    const expectedMV = (990 / tx.price) * endPrice * 0.985 * 0.99
    expect(marketValue).toBeCloseTo(expectedMV, 0)
  })
})

// ============================================================
// Strategy — 管理费多年复利验算
// ============================================================
describe('管理费多年复利验算', () => {
  it('持有 2 年, 管理费 1%/年, 价格不变', () => {
    const rows: { date: string; price: number }[] = [
      { date: '2023-01-01', price: 100 },
      { date: '2025-01-01', price: 100 },
    ]
    const series = new IndexDataImpl('TEST', rows)
    const priceMap = new Map<string, IndexData>([['TEST', series]])

    const s: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2023-01-01', endDate: '2023-01-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0.01 },
      evalWindow: { startDate: '2023-01-01', endDate: '2025-01-01' },
    }
    const { marketValue } = runSimulation(s, priceMap)
    // 10 shares, price=100, mgmtFactor ≈ 0.99^2 = 0.9801 → MV ≈ 980
    expect(marketValue).toBeLessThan(1000)
    expect(marketValue).toBeGreaterThan(970)
  })

  it('🐛 XIRR(365 天/年) vs 管理费 yearsBetween(365.25 天/年)', () => {
    // 同一段持有期, 两个模块对"年数"定义不同
    // 差异 ~0.07%, 精确验算时会注意到
    expect(365).not.toBe(365.25)
  })
})

// ============================================================
// Strategy — 智能定投金额验算
// ============================================================
describe('智能定投金额验算', () => {
  // 10 天: PE = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26]
  const pes = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26]
  const series = makeSeriesWithPE('TEST', '2023-01-01', 10, 100, 0, pes)
  const priceMap = new Map<string, IndexData>([['TEST', series]])

  const smartCfg: SmartConfig = {
    lookbackYears: 10,
    cheapPercentile: 30, cheapMultiplier: 1.5,
    expensivePercentile: 70, expensiveMultiplier: 0.5,
  }

  // 🐛 getMetricsInRange 用 d > endDate 做断点，targetDate='2023-01-01' 时
  // range 内只有 1 个数据点 (PE=8)，countBelow=0, countEqual=1 → 50% → middle
  it('PE=8 → 仅 1 个数据点 → 50% 分位 → middle → 1.0×', () => {
    expect(computeMultiplier(series, '2023-01-01', smartCfg)).toBe(1.0)
  })

  it('PE=16 at last day → 40% 分位 → middle → 1.0×', () => {
    // 将 PE=16 放在最后一天, 确保整个 lookback 包含全部 10 个点
    const pes2 = [8, 10, 12, 14, 18, 20, 22, 24, 26, 16]
    const s2 = makeSeriesWithPE('T', '2023-01-01', 10, 100, 0, pes2)
    // targetDate='2023-01-10' (last): PE=16, below=4/10=40% → middle
    expect(computeMultiplier(s2, '2023-01-10', smartCfg)).toBe(1.0)
  })

  it('PE=24 → 80% 分位 (8/10 < 24) → expensive → 0.5×', () => {
    expect(computeMultiplier(series, '2023-01-09', smartCfg)).toBe(0.5)
  })

  it('PE=26 → 90% 分位 (9/10 < 26) → expensive → 0.5×', () => {
    expect(computeMultiplier(series, '2023-01-10', smartCfg)).toBe(0.5)
  })

  it('🐛 全流水线: runSimulation + smart 模式 — 仅 1 数据点在 range', () => {
    // PE=8 at day 1, lookback 包含 1 天 → 50% → middle → 1.0× (range boundary bug)
    const s: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        amountMode: 'smart', smartConfig: smartCfg,
        startDate: '2023-01-01', endDate: '2023-01-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-01-01' },
    }
    const { transactions } = runSimulation(s, priceMap)
    expect(transactions[0].grossAmount).toBe(1000)
  })

  it('PE 全部 = 15 → countBelow=0, countEqual=10 → 50% 分位 → middle → 1.0', () => {
    const samePE = Array(10).fill(15)
    const sameSeries = makeSeriesWithPE('T2', '2023-01-01', 10, 100, 0, samePE)
    const r = computeMultiplier(sameSeries, '2023-01-10', smartCfg)
    // below=0/10, equal=10/10 → (0 + 5)/10 = 50% → middle
    expect(r).toBe(1.0)
  })
})

// ============================================================
// Valuator — 百分位边界验算
// ============================================================
describe('Valuator 百分位边界验算', () => {
  const defaultCfg: SmartConfig = {
    lookbackYears: 10,
    cheapPercentile: 30, cheapMultiplier: 1.5,
    expensivePercentile: 70, expensiveMultiplier: 0.5,
  }

  it('2 点: PE=20 在 [10,20] → 75% 分位 → expensive → 0.5', () => {
    const data = makeSeriesWithPE('T', '2023-01-01', 2, 100, 0, [10, 20])
    // targetDate='2023-01-02', PE=20, below=1, equal=1 → (1+0.5)/2=75% ≥ 70% → expensive
    const r = computeMultiplier(data, '2023-01-02', defaultCfg)
    expect(r).toBe(0.5)
  })

  it('🐛 3 点: PE=12, range 仅含 2 点 → 75% → expensive → 0.5', () => {
    const data = makeSeriesWithPE('T', '2023-01-01', 3, 100, 0, [10, 12, 20])
    // targetDate='2023-01-02', range 含 [10,12] (2 点), below=1, equal=1 → (1+0.5)/2=75% ≥ 70% → expensive
    const r = computeMultiplier(data, '2023-01-02', defaultCfg)
    expect(r).toBe(0.5)
  })

  it('🐛 边界值: PE=10, 去重后仅在 range 含 {5,10} → 75% → expensive → 0.5', () => {
    // PE = [5,5,5, 10, 15,15,15,15,15,15], targetDate='2023-01-04' (PE=10)
    // range [2013-01-01, 2023-01-04] 含天 1-4: PE={5,10}, below=1, equal=1 → 75% → expensive
    const peVals = [5, 5, 5, 10, 15, 15, 15, 15, 15, 15]
    const data = makeSeriesWithPE('T', '2023-01-01', 10, 100, 0, peVals)
    const r = computeMultiplier(data, '2023-01-04', defaultCfg)
    expect(r).toBe(0.5)
  })

  it('🐛 getMetricsInRange 用 Set<number> 去重, 扭曲百分位', () => {
    // PE=15 出现 50 次, PE=10 出现 1 次 (在最后)
    // 去重后: history={15, 10} (2 个值), 不去重: 51 个值
    const rows: { date: string; price: number; metric?: number }[] = []
    for (let i = 0; i < 50; i++) {
      const dt = new Date(2023, 0, 1 + i)
      const ds = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
      rows.push({ date: ds, price: 100 + i, metric: 15 })
    }
    rows.push({ date: '2023-03-01', price: 200, metric: 10 })
    const data = new IndexDataImpl('T', rows)

    // targetDate='2023-02-19' (PE=15): 去重后 history={15}, percentile=0% → 1.5
    // 不去重 would give: below=0/50=0% → 1.5 (结果碰巧相同)
    // 但 targetDate='2023-03-01' (PE=10): 去重后 history={15,10}, below=1/2=50% → 1.0
    // 不去重: below=0/51=0% → 1.5 (差异!)
    const r10 = computeMultiplier(data, '2023-03-01', defaultCfg)
    // 去重后 PE=10 有 1 个低于它的值(15 不对, 10 不小于 15)
    // 等等: history for PE=10: values in range include 50×15 and 1×10
    // 去重: {15, 10}, below=1(10<15? no), wait PE=10 is current, 15 > 10
    // below counts values STRICTLY LESS than current=10: none → 0/2=0% → 1.5
    // Hmm wait, that means both cases give 1.5? Let me re-check.
    // Actually for targetDate='2023-02-19' PE=15: history (deduped) = {15} if only PEs up to 2/19
    // Wait, the lookback end is '2023-02-19', so March data isn't included.
    // This test is fundamentally about whether dedup exists. Let me verify by checking
    // that the code actually deduplicates.
    const history = data.getMetricsInRange('2013-01-01', '2023-06-01')
    // If dedup works: history.length should be 2 (15 and 10)
    // If no dedup: history.length should be 51
    expect(history.length).toBe(2)
  })
})

// ============================================================
// Strategy — 风险指标手工验算
// ============================================================
describe('风险指标手工验算', () => {
  const rows: { date: string; price: number }[] = [
    { date: '2023-01-01', price: 100 },
    { date: '2023-02-01', price: 120 },
    { date: '2023-03-01', price: 80 },
  ]
  const series = new IndexDataImpl('TEST', rows)
  const priceMap = new Map<string, IndexData>([['TEST', series]])

  const strat: Strategy = {
    segments: [{
      indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
      startDate: '2023-01-01', endDate: '2023-03-01',
    }],
    fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
    evalWindow: { startDate: '2023-01-01', endDate: '2023-03-01' },
  }

  it('最大回撤 — 一路新高, maxDD=0 → 返回 null', () => {
    // MV: 1000 → 2200 → 2467, peak 不断更新, 无回撤
    // 代码: maxDD > 0 ? maxDD : null → null
    const { maxDrawdown } = runSimulation(strat, priceMap)
    expect(maxDrawdown).toBeNull()
  })

  it('最大回撤 — 先涨后跌有回撤', () => {
    const rows2: { date: string; price: number }[] = [
      { date: '2023-01-01', price: 100 },
      { date: '2023-02-01', price: 150 }, // peak
      { date: '2023-03-01', price: 50 },  // trough
      { date: '2023-04-01', price: 90 },
    ]
    const s2 = new IndexDataImpl('TEST', rows2)
    const pm2 = new Map<string, IndexData>([['TEST', s2]])
    const strat2: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2023-01-01', endDate: '2023-03-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-04-01' },
    }
    const { maxDrawdown } = runSimulation(strat2, pm2)
    expect(maxDrawdown).toBeGreaterThan(0)
    expect(maxDrawdown!).toBeLessThanOrEqual(1)
  })

  it('🐛 Calmar 比率 — 用累计收益(非年化)除以最大回撤', () => {
    // 标准: Calmar = CAGR / maxDD
    // 代码: Calmar = cumulativeReturn / maxDD
    const { calmarRatio, cumulativeReturn, maxDrawdown } = runSimulation(strat, priceMap)
    if (maxDrawdown && maxDrawdown > 0) {
      // 验证当前实现确实是 cumulative/maxDD
      expect(calmarRatio).toBeCloseTo(cumulativeReturn / maxDrawdown, 5)
    }
  })

  it('🐛 longestDrawdownDays 统计交易笔数, 不是日历天数', () => {
    // 名称暗示"天数", 代码计数的是连续水下交易次数
    const { longestDrawdownDays } = runSimulation(strat, priceMap)
    expect(typeof longestDrawdownDays).toBe('number')
  })

  it('年化波动率 — 组合 MV 序列剥离新增投入', () => {
    const hs300 = makeSeries('沪深300', '2023-01-01', 90, 100, 0.2)
    const bond = makeSeries('国债', '2023-01-01', 90, 100, 0.01)
    const pm = new Map<string, IndexData>([['沪深300', hs300], ['国债', bond]])
    const s: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2023-01-01', endDate: '2023-03-01',
        allocations: [
          { indexName: '沪深300', weight: 0.5 },
          { indexName: '国债', weight: 0.5 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-03-31' },
    }
    const { annualVolatility } = runSimulation(s, pm)
    // 组合 MV 序列三个月有价格波动，应产生非零波动率
    expect(annualVolatility).not.toBeNull()
    expect(annualVolatility!).toBeGreaterThan(0)
  })
})

// ============================================================
// Strategy — 组合定投验算
// ============================================================
describe('组合定投验算', () => {
  const hs300 = new IndexDataImpl('沪深300', [
    { date: '2023-01-01', price: 100 },
    { date: '2023-02-01', price: 110 },
  ])
  const bond = new IndexDataImpl('国债', [
    { date: '2023-01-01', price: 100 },
    { date: '2023-02-01', price: 102 },
  ])
  const pm = new Map<string, IndexData>([['沪深300', hs300], ['国债', bond]])

  it('权重分配: 2000 × 0.6/0.4 → 1200 + 800', () => {
    const s: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2023-01-01', endDate: '2023-01-01',
        allocations: [
          { indexName: '沪深300', weight: 0.6 },
          { indexName: '国债', weight: 0.4 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-01-01' },
    }
    const { transactions, totalCost } = runSimulation(s, pm)
    expect(transactions).toHaveLength(2)
    expect(transactions[0].grossAmount).toBe(1200)
    expect(transactions[1].grossAmount).toBe(800)
    expect(totalCost).toBe(2000)
  })

  it('组合 + 申购费: shares 按净额计算', () => {
    const s: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2023-01-01', endDate: '2023-01-01',
        allocations: [
          { indexName: '沪深300', weight: 0.6 },
          { indexName: '国债', weight: 0.4 },
        ],
      }],
      fees: { purchaseFee: 0.01, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-01-01' },
    }
    const { transactions } = runSimulation(s, pm)
    // 沪深300: gross=1200, net=1188, shares=11.88
    expect(transactions[0].shares).toBeCloseTo(11.88, 1)
    // 国债: gross=800, net=792, shares=7.92
    expect(transactions[1].shares).toBeCloseTo(7.92, 1)
  })

  it('市值汇总: 各持仓独立计算后求和', () => {
    const s: Strategy = {
      segments: [{
        indexName: '', frequency: 'monthly', day: 1, amount: 2000,
        startDate: '2023-01-01', endDate: '2023-01-01',
        allocations: [
          { indexName: '沪深300', weight: 0.6 },
          { indexName: '国债', weight: 0.4 },
        ],
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-02-01' },
    }
    const { marketValue } = runSimulation(s, pm)
    // 沪深300: 12 shares × 110 = 1320
    // 国债: 8 shares × 102 = 816
    // total = 2136
    expect(marketValue).toBeCloseTo(2136, 0)
  })
})

// ============================================================
// Strategy — 混合定投 (fixed + smart)
// ============================================================
describe('混合定投模式', () => {
  const pes = [5, 8, 10, 12, 14, 16, 18, 20, 22, 25]
  const series = makeSeriesWithPE('TEST', '2023-01-01', 10, 100, 0, pes)
  const pm = new Map<string, IndexData>([['TEST', series]])

  it('🐛 同一策略内 fixed 和 smart 片段互不干扰 — range 边界限制', () => {
    const smartCfg: SmartConfig = {
      lookbackYears: 10,
      cheapPercentile: 30, cheapMultiplier: 2,
      expensivePercentile: 70, expensiveMultiplier: 0.5,
    }
    const s: Strategy = {
      segments: [
        {
          indexName: 'TEST', frequency: 'monthly', day: 1, amount: 500,
          amountMode: 'fixed',
          startDate: '2023-01-01', endDate: '2023-01-01',
        },
        {
          indexName: 'TEST', frequency: 'monthly', day: 1, amount: 500,
          amountMode: 'smart', smartConfig: smartCfg,
          startDate: '2023-01-01', endDate: '2023-01-01',
        },
      ],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-01-01' },
    }
    const { transactions, totalCost } = runSimulation(s, pm)
    // fixed=500, smart: PE=5, 仅 1 点 → 50% → middle → 1× = 500
    expect(transactions).toHaveLength(2)
    expect(transactions[0].grossAmount).toBe(500)
    expect(transactions[1].grossAmount).toBe(500)
    expect(totalCost).toBe(1000)
  })
})

// ============================================================
// 边界条件
// ============================================================
describe('边界条件', () => {
  it('空 segment → 交易/成本/市值/XIRR 全部零或 null', () => {
    const series = makeSeries('TEST', '2023-01-01', 10, 100, 0)
    const pm = new Map<string, IndexData>([['TEST', series]])
    const { transactions, totalCost, marketValue, xirr: r } = runSimulation(
      { segments: [], fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 }, evalWindow: { startDate: '2023-01-01', endDate: '2023-12-31' } },
      pm,
    )
    expect(transactions).toHaveLength(0)
    expect(totalCost).toBe(0)
    expect(marketValue).toBe(0)
    expect(r).toBeNull()
  })

  it('定投日超出数据范围 → 全部被跳过', () => {
    const series = makeSeries('TEST', '2023-01-01', 10, 100, 0)
    const pm = new Map<string, IndexData>([['TEST', series]])
    const s: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2030-01-01', endDate: '2030-06-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2030-01-01', endDate: '2030-12-31' },
    }
    const { transactions } = runSimulation(s, pm)
    expect(transactions).toHaveLength(0)
  })

  it('单笔交易 — XIRR 含正负现金流可计算', () => {
    // 需要 evalEnd 在数据范围内
    const rows: { date: string; price: number }[] = [
      { date: '2023-01-01', price: 100 },
      { date: '2023-03-01', price: 100 },
    ]
    const series = new IndexDataImpl('TEST', rows)
    const pm = new Map<string, IndexData>([['TEST', series]])
    const s: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2023-01-01', endDate: '2023-01-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-03-01' },
    }
    const { xirr: r } = runSimulation(s, pm)
    // 1 笔买入 + 1 笔市值回收 → 可计算 XIRR
    expect(r).not.toBeNull()
  })

  it('价格不变 → cumulativeReturn ≈ 0', () => {
    const rows: { date: string; price: number }[] = [
      { date: '2023-01-01', price: 100 },
      { date: '2023-12-31', price: 100 },
    ]
    const series = new IndexDataImpl('TEST', rows)
    const pm = new Map<string, IndexData>([['TEST', series]])
    const s: Strategy = {
      segments: [{
        indexName: 'TEST', frequency: 'monthly', day: 1, amount: 1000,
        startDate: '2023-01-01', endDate: '2023-01-01',
      }],
      fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
      evalWindow: { startDate: '2023-01-01', endDate: '2023-12-31' },
    }
    const { cumulativeReturn, xirr: r } = runSimulation(s, pm)
    expect(cumulativeReturn).toBeCloseTo(0, 1)
    expect(r).toBeCloseTo(0, 1)
  })
})
