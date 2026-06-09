import { describe, it, expect } from 'vitest'
import { runSimulation, type Strategy, type Segment, type PortfolioSummary } from './strategy'
import { parseCSV, type IndexData, IndexDataImpl } from './data-loader'
import * as fs from 'fs'
import * as path from 'path'

function loadCSVData(indexName: string): IndexData {
  const csvPath = path.join(__dirname, '../../public/data', `${indexName}.csv`)
  const csvText = fs.readFileSync(csvPath, 'utf-8')
  return parseCSV(csvText, indexName)
}

function createPriceMap(): Map<string, IndexData> {
  const map = new Map<string, IndexData>()
  map.set('沪深300全收益', loadCSVData('沪深300全收益'))
  map.set('国债5-7年', loadCSVData('国债5-7年'))
  return map
}

function formatResult(name: string, summary: PortfolioSummary): string {
  return `${name}
├── 总投入: ¥${summary.totalCost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
├── 期末市值: ¥${summary.marketValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
├── 累计收益: ${(summary.cumulativeReturn * 100).toFixed(1)}%
├── XIRR: ${summary.xirr !== null ? (summary.xirr * 100).toFixed(2) : '-'}%
├── 最大回撤: ${summary.maxDrawdown !== null ? (summary.maxDrawdown * 100).toFixed(1) : '-'}%
├── 年化波动率: ${summary.annualVolatility !== null ? (summary.annualVolatility * 100).toFixed(1) : '-'}%
├── Calmar比率: ${summary.calmarRatio !== null ? summary.calmarRatio.toFixed(2) : '-'}
├── 最长回撤天数: ${summary.longestDrawdownDays}
└── 交易次数: ${summary.transactions.length}`
}

describe('策略对比测试', () => {
  const priceMap = createPriceMap()
  const testPeriod = { startDate: '2006-01-01', endDate: '2025-12-31' }

  const strategies: { name: string; strategy: Strategy }[] = [
    {
      name: '策略1: 沪深300全收益',
      strategy: {
        segments: [{
          indexName: '沪深300全收益',
          frequency: 'monthly',
          day: 1,
          amount: 1000,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
        }],
        fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
        evalWindow: testPeriod,
      },
    },
    {
      name: '策略2: 50%沪深300全收益 + 50%国债5-7年',
      strategy: {
        segments: [{
          indexName: '',
          frequency: 'monthly',
          day: 1,
          amount: 1000,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          dynamicBuy: false,
          rebalance: false,
          allocations: [
            { indexName: '沪深300全收益', weight: 0.5 },
            { indexName: '国债5-7年', weight: 0.5 },
          ],
        }],
        fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
        evalWindow: testPeriod,
      },
    },
    {
      name: '策略3: 策略2 + 动态买入',
      strategy: {
        segments: [{
          indexName: '',
          frequency: 'monthly',
          day: 1,
          amount: 1000,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          dynamicBuy: true,
          rebalance: false,
          allocations: [
            { indexName: '沪深300全收益', weight: 0.5 },
            { indexName: '国债5-7年', weight: 0.5 },
          ],
        }],
        fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
        evalWindow: testPeriod,
      },
    },
    {
      name: '策略4: 策略2 + 再平衡(阈值5%,最小3个月,摩擦成本0.5%)',
      strategy: {
        segments: [{
          indexName: '',
          frequency: 'monthly',
          day: 1,
          amount: 1000,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          dynamicBuy: false,
          rebalance: true,
          allocations: [
            { indexName: '沪深300全收益', weight: 0.5 },
            { indexName: '国债5-7年', weight: 0.5 },
          ],
        }],
        fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
        evalWindow: testPeriod,
        rebalanceConfig: {
          deviationThreshold: 0.05,
          minIntervalMonths: 3,
          tradeCostRate: 0.005,
        },
      },
    },
    {
      name: '策略5: 策略4 + 动态买入',
      strategy: {
        segments: [{
          indexName: '',
          frequency: 'monthly',
          day: 1,
          amount: 1000,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          dynamicBuy: true,
          rebalance: true,
          allocations: [
            { indexName: '沪深300全收益', weight: 0.5 },
            { indexName: '国债5-7年', weight: 0.5 },
          ],
        }],
        fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
        evalWindow: testPeriod,
        rebalanceConfig: {
          deviationThreshold: 0.05,
          minIntervalMonths: 3,
          tradeCostRate: 0.005,
        },
      },
    },
  ]

  it('运行所有策略对比', () => {
    const results: { name: string; summary: PortfolioSummary }[] = []
    
    for (const { name, strategy } of strategies) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(name)
      console.log('='.repeat(60))
      
      const summary = runSimulation(strategy, priceMap)
      results.push({ name, summary })
      
      console.log(formatResult(name, summary))
    }

    console.log('\n' + '='.repeat(60))
    console.log('策略对比汇总表')
    console.log('='.repeat(60))
    console.log(`| 策略 | 总投入 | 期末市值 | 累计收益 | XIRR | 最大回撤 | 年化波动率 | Calmar |`)
    console.log(`|------|--------|----------|----------|------|----------|------------|--------|`)
    
    for (const { name, summary } of results) {
      console.log(`| ${name.replace('策略', 'S')} | ¥${summary.totalCost.toLocaleString()} | ¥${summary.marketValue.toLocaleString()} | ${(summary.cumulativeReturn * 100).toFixed(1)}% | ${summary.xirr !== null ? (summary.xirr * 100).toFixed(2) : '-'}% | ${summary.maxDrawdown !== null ? (summary.maxDrawdown * 100).toFixed(1) : '-'}% | ${summary.annualVolatility !== null ? (summary.annualVolatility * 100).toFixed(1) : '-'}% | ${summary.calmarRatio !== null ? summary.calmarRatio.toFixed(2) : '-'} |`)
    }

    expect(true).toBe(true)
  })
})