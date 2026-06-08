import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'
import { getAssetCategory } from '@/App'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  priceMap: Map<string, IndexData>
  evalEndDate: string
}

export default function ValueChart({ summary, transactions, priceMap, evalEndDate }: Props) {
  const option = useMemo(() => {
    if (transactions.length === 0) return {}

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    interface TxInfo {
      indexName: string
      grossAmount: number
      type: string
      source: string
    }

    interface RebalanceInfo {
      before: { stock: number; bond: number; gold: number }
      after: { stock: number; bond: number; gold: number }
      sellTotal: number
      buyTotal: number
      tradeCost: number
    }

    interface Point {
      date: string; cost: number; value: number
      breakdown?: { stock: number; bond: number; gold: number; sub: { aStock: number; usStock: number } }
      buyTx?: TxInfo[]
      hasRebalance: boolean
      rebalanceInfo?: RebalanceInfo
    }

    const txByDate = new Map<string, TxInfo[]>()
    const rebalanceDates = new Set<string>()
    let hasAnyRebalance = false
    for (const tx of sorted) {
      const list = txByDate.get(tx.date) || []
      list.push({ indexName: tx.indexName, grossAmount: tx.grossAmount, type: tx.type, source: tx.source })
      txByDate.set(tx.date, list)
      if (tx.source === 'rebalance') {
        rebalanceDates.add(tx.date)
        hasAnyRebalance = true
      }
    }

    const points: Point[] = []
    let runningCost = 0
    const shareAcc: Record<string, number> = {}

    for (const tx of sorted) {
      if (tx.source === 'invest') runningCost += tx.grossAmount
      if (tx.type === 'buy') {
        shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares
      } else {
        shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) - tx.shares
      }
      let mv = 0
      const breakdown = { stock: 0, bond: 0, gold: 0, sub: { aStock: 0, usStock: 0 } }
      for (const [idxName, shares] of Object.entries(shareAcc)) {
        const series = priceMap.get(idxName)
        if (!series) continue
        const price = series.getPrice(tx.date)
        if (price !== null) {
          const val = shares * price
          mv += val
          const cat = getAssetCategory(idxName)
          if (cat.category === 'stock') {
            breakdown.stock += val
            if (cat.subCategory === 'us-stock') breakdown.sub.usStock += val
            else breakdown.sub.aStock += val
          } else if (cat.category === 'bond') {
            breakdown.bond += val
          } else if (cat.category === 'gold') {
            breakdown.gold += val
          }
        }
      }
      points.push({ date: tx.date, cost: runningCost, value: mv, breakdown, hasRebalance: false })
    }

    // Deduplicate by date
    const uniquePoints: Point[] = []
    for (const pt of points) {
      const last = uniquePoints[uniquePoints.length - 1]
      if (last && last.date === pt.date) {
        uniquePoints[uniquePoints.length - 1] = pt
      } else {
        uniquePoints.push(pt)
      }
    }
    for (const pt of uniquePoints) {
      pt.buyTx = txByDate.get(pt.date)
      pt.hasRebalance = hasAnyRebalance && rebalanceDates.has(pt.date)

      if (pt.hasRebalance && pt.buyTx && pt.breakdown && pt.value > 0) {
        const rbTxs = pt.buyTx.filter(t => t.source === 'rebalance')
        const sells = rbTxs.filter(t => t.type === 'sell')
        const buys = rbTxs.filter(t => t.type === 'buy')
        const sellTotal = sells.reduce((s, t) => s + t.grossAmount, 0)
        const buyTotal = buys.reduce((s, t) => s + t.grossAmount, 0)

        // Reverse rebalance effects to get pre-rebalance breakdown
        const before = { stock: pt.breakdown.stock, bond: pt.breakdown.bond, gold: pt.breakdown.gold }
        for (const t of sells) {
          const cat = getAssetCategory(t.indexName)
          if (cat.category === 'stock') before.stock += t.grossAmount
          else if (cat.category === 'bond') before.bond += t.grossAmount
          else if (cat.category === 'gold') before.gold += t.grossAmount
        }
        for (const t of buys) {
          const cat = getAssetCategory(t.indexName)
          if (cat.category === 'stock') before.stock -= t.grossAmount
          else if (cat.category === 'bond') before.bond -= t.grossAmount
          else if (cat.category === 'gold') before.gold -= t.grossAmount
        }

        const preTotal = before.stock + before.bond + before.gold
        pt.rebalanceInfo = {
          before: {
            stock: preTotal > 0 ? (before.stock / preTotal) * 100 : 0,
            bond: preTotal > 0 ? (before.bond / preTotal) * 100 : 0,
            gold: preTotal > 0 ? (before.gold / preTotal) * 100 : 0,
          },
          after: {
            stock: pt.value > 0 ? (pt.breakdown.stock / pt.value) * 100 : 0,
            bond: pt.value > 0 ? (pt.breakdown.bond / pt.value) * 100 : 0,
            gold: pt.value > 0 ? (pt.breakdown.gold / pt.value) * 100 : 0,
          },
          sellTotal,
          buyTotal,
          tradeCost: sellTotal - buyTotal,
        }
      }
    }

    if (uniquePoints.length > 0) {
      let terminalMV = 0
      for (const [idxName, shares] of Object.entries(shareAcc)) {
        const series = priceMap.get(idxName)
        if (!series) continue
        const price = series.getPrice(evalEndDate)
        if (price !== null) terminalMV += shares * price
      }
      uniquePoints.push({
        date: evalEndDate,
        cost: runningCost,
        value: terminalMV > 0 ? terminalMV : uniquePoints[uniquePoints.length - 1].value,
        hasRebalance: false,
      })
    }

    const costData = uniquePoints.map((p) => [p.date, p.cost] as [string, number])
    const valueData = uniquePoints.map((p) => [p.date, p.value] as [string, number])

    let crossoverIdx = -1
    for (let i = 0; i < uniquePoints.length; i++) {
      if (valueData[i] >= costData[i]) {
        crossoverIdx = i
        break
      }
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0F172A',
        borderColor: '#475569',
        textStyle: { color: '#F8FAFC', fontSize: 12, fontFamily: 'IBM Plex Sans' },
        formatter: (params: any) => {
          const arr = Array.isArray(params) ? params : [params]
          const date = arr[0]?.axisValue || ''
          let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">${date}</div>`
          for (const p of arr) {
            if (p.value == null) continue
            const amount = Array.isArray(p.value) ? p.value[1] : p.value
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <span style="font-family:Fira Code;font-weight:600;">¥ ${Number(amount).toLocaleString()}</span></div>`
          }
          const idx = arr[0]?.dataIndex
          if (idx !== undefined && idx < uniquePoints.length) {
            const pt = uniquePoints[idx]
            if (pt.cost > 0) {
              const ret = (pt.value - pt.cost) / pt.cost
              const sign = ret >= 0 ? '+' : ''
              html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;">累计收益率</span> <span style="font-family:Fira Code;font-weight:600;color:${ret >= 0 ? '#EF4444' : '#22C55E'};">${sign}${(ret * 100).toFixed(2)}%</span></div>`
            }

            if (pt.breakdown && pt.value > 0) {
              const bd = pt.breakdown
              const categories: { label: string; pct: number }[] = []
              if (bd.stock > 0) {
                const aPct = (bd.sub.aStock / pt.value * 100)
                const uPct = (bd.sub.usStock / pt.value * 100)
                let label = `股票 ${(bd.stock / pt.value * 100).toFixed(0)}%`
                if (bd.sub.aStock > 0 && bd.sub.usStock > 0) {
                  label += `  (A股 ${aPct.toFixed(0)}%  美股 ${uPct.toFixed(0)}%)`
                } else if (bd.sub.aStock > 0 && bd.sub.usStock === 0) {
                  label += `  (A股)`
                } else if (bd.sub.usStock > 0 && bd.sub.aStock === 0) {
                  label += `  (美股)`
                }
                categories.push({ label, pct: bd.stock / pt.value * 100 })
              }
              if (bd.bond > 0) {
                categories.push({ label: `债券 ${(bd.bond / pt.value * 100).toFixed(0)}%`, pct: bd.bond / pt.value * 100 })
              }
              if (bd.gold > 0) {
                categories.push({ label: `黄金 ${(bd.gold / pt.value * 100).toFixed(0)}%`, pct: bd.gold / pt.value * 100 })
              }

              if (categories.length > 0) {
                html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;font-size:11px;">资产配置</span>`
                for (const cat of categories) {
                  html += `<div style="font-size:11px;color:#94A3B8;">  ${cat.label}</div>`
                }
                html += `</div>`
              }
            }

            if (pt.buyTx && pt.buyTx.length > 0) {
              const investTxs = pt.buyTx.filter(t => t.source === 'invest')
              const rebalanceTxs = pt.buyTx.filter(t => t.source === 'rebalance')

              if (investTxs.length > 0) {
                const totalBuy = investTxs.reduce((s, t) => s + t.grossAmount, 0)
                html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;font-size:11px;">本次买入</span>`
                for (const t of investTxs) {
                  const pct = totalBuy > 0 ? (t.grossAmount / totalBuy * 100).toFixed(0) : '0'
                  html += `<div style="font-size:11px;color:#94A3B8;">  ${t.indexName}: ¥ ${t.grossAmount.toLocaleString()} (${pct}%)</div>`
                }
                html += `</div>`
              }

              if (rebalanceTxs.length > 0) {
                html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #F59E0B;"><span style="color:#F59E0B;font-size:11px;">本次调仓</span>`
                const sells = rebalanceTxs.filter(t => t.type === 'sell')
                const buys = rebalanceTxs.filter(t => t.type === 'buy')

                if (pt.rebalanceInfo) {
                  const ri = pt.rebalanceInfo
                  const fmtPct = (v: number) => v.toFixed(1) + '%'
                  html += `<div style="font-size:11px;color:#94A3B8;">  调仓前: 股 ${fmtPct(ri.before.stock)} / 债 ${fmtPct(ri.before.bond)} / 金 ${fmtPct(ri.before.gold)}</div>`
                  html += `<div style="font-size:11px;color:#94A3B8;">  调仓后: 股 ${fmtPct(ri.after.stock)} / 债 ${fmtPct(ri.after.bond)} / 金 ${fmtPct(ri.after.gold)}</div>`
                  html += `<div style="font-size:11px;color:#64748B;">  成本: ¥ ${ri.tradeCost.toLocaleString()}</div>`
                }

                if (sells.length > 0) {
                  html += `<div style="font-size:11px;color:#94A3B8;">  卖出:</div>`
                  for (const t of sells) {
                    html += `<div style="font-size:11px;color:#94A3B8;">    ${t.indexName}: ¥ ${t.grossAmount.toLocaleString()}</div>`
                  }
                }
                if (buys.length > 0) {
                  html += `<div style="font-size:11px;color:#94A3B8;">  买入:</div>`
                  for (const t of buys) {
                    html += `<div style="font-size:11px;color:#94A3B8;">    ${t.indexName}: ¥ ${t.grossAmount.toLocaleString()}</div>`
                  }
                }
                html += `</div>`
              }
            }
          }
          return html
        },
      },
      legend: {
        data: ['期末总市值', '累计投入成本', ...(hasAnyRebalance ? ['调仓'] : [])],
        top: 0,
        textStyle: { color: '#94A3B8', fontSize: 12 },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        min: uniquePoints[0]?.date,
        max: uniquePoints[uniquePoints.length - 1]?.date,
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (v: number) => (v / 10000).toFixed(0) + '万',
        },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      dataZoom: [
        { type: 'slider', bottom: 10, height: 20, borderColor: '#334155', backgroundColor: '#0F172A', dataBackground: { lineStyle: { color: '#334155' }, areaStyle: { color: '#1E293B' } } },
      ],
      series: [
        {
          name: '期末总市值',
          type: 'line',
          data: valueData,
          smooth: true,
          lineStyle: { color: '#22C55E', width: 2 },
          itemStyle: { color: '#22C55E' },
          areaStyle: { color: 'rgba(34,197,94,0.12)' },
          symbol: 'none',
        },
        {
          name: '累计投入成本',
          type: 'line',
          data: costData,
          smooth: true,
          lineStyle: { color: '#3B82F6', width: 1.5, type: 'dashed' },
          itemStyle: { color: '#3B82F6' },
          symbol: 'none',
        },
        ...(hasAnyRebalance ? [{
          name: '调仓',
          type: 'scatter',
          data: uniquePoints.filter(p => p.hasRebalance).map(p => [p.date, p.value] as [string, number]),
          symbolSize: 8,
          itemStyle: { color: '#F59E0B' },
          symbol: 'diamond',
        }] : []),
        ...(crossoverIdx >= 0 ? [{
          name: '回本节点',
          type: 'scatter',
          data: [[uniquePoints[crossoverIdx].date, uniquePoints[crossoverIdx].value]],
          symbolSize: 10,
          itemStyle: { color: '#F59E0B' },
          symbol: 'pin',
          label: { show: true, position: 'top', color: '#F59E0B', fontSize: 11, formatter: '市值超越成本' },
        }] : []),
      ] as object[],
    }
  }, [summary, transactions, priceMap, evalEndDate])

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      {transactions.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-text-muted text-sm">暂无数据</div>
      ) : (
        <ReactECharts option={option} style={{ height: 340 }} opts={{ renderer: 'canvas' }} />
      )}
    </div>
  )
}
