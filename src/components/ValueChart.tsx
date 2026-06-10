import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary, Segment } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'
import { getAssetCategory } from '@/App'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  priceMap: Map<string, IndexData>
  evalEndDate: string
  segments?: Segment[]
}

export default function ValueChart({ summary, transactions, priceMap, evalEndDate, segments }: Props) {
  const option = useMemo(() => {
    if (transactions.length === 0) return {}

    // Build date → index target weight map from segments
    const targetWeights = new Map<string, Record<string, number>>()
    if (segments) {
      for (const seg of segments) {
        const allocations = seg.allocations && seg.allocations.length > 0
          ? seg.allocations
          : [{ indexName: seg.indexName, weight: 1 }]
        const tw: Record<string, number> = {}
        for (const a of allocations) tw[a.indexName] = a.weight
        targetWeights.set(seg.startDate, tw)
      }
    }
    const getTargetWeight = (date: string, idxName: string): number | null => {
      if (targetWeights.size === 0) return null
      // Find the segment whose startDate <= date (closest start date before this date)
      let best: string | null = null
      for (const sd of targetWeights.keys()) {
        if (sd <= date && (!best || sd > best)) best = sd
      }
      if (!best) return null
      const tw = targetWeights.get(best)!
      return tw[idxName] ?? null
    }

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
      indexBreakdown?: { name: string; value: number; pct: number; targetWeight: number; category: string; subCategory: string | null }[]
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
      const idxDetails: Point['indexBreakdown'] = []
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
      // Build per-index breakdown after we have total MV
      for (const [idxName, shares] of Object.entries(shareAcc)) {
        const series = priceMap.get(idxName)
        if (!series) continue
        const price = series.getPrice(tx.date)
        if (price === null) continue
        const val = shares * price
        if (val <= 0) continue
        const cat = getAssetCategory(idxName)
        const tw = getTargetWeight(tx.date, idxName)
        idxDetails.push({
          name: idxName,
          value: val,
          pct: mv > 0 ? val / mv : 0,
          targetWeight: tw ?? 0,
          category: cat.category,
          subCategory: cat.subCategory,
        })
      }
      points.push({ date: tx.date, cost: runningCost, value: mv, breakdown, indexBreakdown: idxDetails, hasRebalance: false })
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

        // Build pre-rebalance per-index breakdown by reversing rebalance txs
        const preMV = pt.value + sellTotal - buyTotal
        if (pt.indexBreakdown && preMV > 0) {
          const preIdx: Record<string, number> = {}
          for (const idx of pt.indexBreakdown) preIdx[idx.name] = idx.value
          for (const t of sells) preIdx[t.indexName] = (preIdx[t.indexName] || 0) + t.grossAmount
          for (const t of buys) preIdx[t.indexName] = (preIdx[t.indexName] || 0) - t.grossAmount
          pt.indexBreakdown = pt.indexBreakdown.map(idx => {
            const preVal = preIdx[idx.name] || 0
            return { ...idx, value: preVal, pct: preVal / preMV }
          })
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
          const raw = arr[0]?.axisValue
          // ECharts time axis may pass Date object, timestamp, or string
          let date = ''
          if (raw instanceof Date) {
            date = raw.getFullYear() + '-' + String(raw.getMonth() + 1).padStart(2, '0') + '-' + String(raw.getDate()).padStart(2, '0')
          } else if (typeof raw === 'number') {
            const d = new Date(raw)
            date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
          } else {
            date = String(raw ?? '')
          }

          // Header
          let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #334155;">${date}</div>`

          const idx = arr[0]?.dataIndex
          if (idx === undefined || idx >= uniquePoints.length) return html
          const pt = uniquePoints[idx]

          // ── Top row: KPI summary ──
          const mvAmount = Array.isArray(arr[0]?.value) ? arr[0].value[1] : arr[0]?.value
          const costAmount = arr[1] ? (Array.isArray(arr[1].value) ? arr[1].value[1] : arr[1].value) : 0

          html += `<div style="display:flex;gap:12px;margin-bottom:6px;font-size:11px;">`
          html += `<div><span style="color:#64748B;">市值</span> <span style="font-family:Fira Code;font-weight:600;">¥ ${Number(mvAmount).toLocaleString()}</span></div>`
          if (pt.cost > 0) {
            const ret = (pt.value - pt.cost) / pt.cost
            const sign = ret >= 0 ? '+' : ''
            html += `<div><span style="color:#64748B;">收益率</span> <span style="font-family:Fira Code;font-weight:600;color:${ret >= 0 ? '#EF4444' : '#22C55E'};">${sign}${(ret * 100).toFixed(2)}%</span></div>`
          }
          html += `<div><span style="color:#64748B;">成本</span> <span style="font-family:Fira Code;font-weight:600;">¥ ${Number(costAmount).toLocaleString()}</span></div>`
          html += `</div>`

          // ── Two-column body ──
          html += `<div style="display:flex;gap:16px;">`

          // Left column: 资产配置
          let leftHtml = ''
          if (pt.indexBreakdown && pt.indexBreakdown.length > 0 && pt.value > 0) {
            const idxs = pt.indexBreakdown
            const catOrder = ['stock', 'bond', 'gold'] as const
            const catLabels: Record<string, string> = { stock: '股票', bond: '债券', gold: '黄金' }
            leftHtml = `<div style="min-width:180px;"><div style="color:#64748B;margin-bottom:2px;">资产配置</div>`
            for (const cat of catOrder) {
              const catIdxs = idxs.filter(i => i.category === cat)
              if (catIdxs.length === 0) continue
              const catPct = catIdxs.reduce((s, i) => s + i.pct, 0)
              const catTarget = catIdxs.reduce((s, i) => s + i.targetWeight, 0)
              leftHtml += `<div style="color:#94A3B8;">${catLabels[cat]} ${(catPct * 100).toFixed(0)}% <span style="color:#64748B;">目标 ${(catTarget * 100).toFixed(0)}%</span></div>`
              for (const idx of catIdxs) {
                leftHtml += `<div style="color:#64748B;padding-left:8px;">${idx.name} ${(idx.pct * 100).toFixed(0)}% 目标 ${(idx.targetWeight * 100).toFixed(0)}%</div>`
              }
            }
            leftHtml += `</div>`
          }

          // Right column: transactions (invest + rebalance)
          let rightHtml = ''
          if (pt.buyTx && pt.buyTx.length > 0) {
            const investTxs = pt.buyTx.filter(t => t.source === 'invest')
            const rebalanceTxs = pt.buyTx.filter(t => t.source === 'rebalance')
            rightHtml = `<div>`

            if (investTxs.length > 0) {
              const totalBuy = investTxs.reduce((s, t) => s + t.grossAmount, 0)
              rightHtml += `<div style="color:#64748B;margin-bottom:2px;">本次买入</div>`
              for (const t of investTxs) {
                const pct = totalBuy > 0 ? (t.grossAmount / totalBuy * 100).toFixed(0) : '0'
                rightHtml += `<div style="color:#94A3B8;padding-left:8px;white-space:nowrap;">${t.indexName} ¥${t.grossAmount.toLocaleString()} (${pct}%)</div>`
              }
            }

            if (rebalanceTxs.length > 0) {
              const sells = rebalanceTxs.filter(t => t.type === 'sell')
              const buys = rebalanceTxs.filter(t => t.type === 'buy')

              rightHtml += `<div style="color:#F59E0B;margin-top:6px;margin-bottom:2px;">本次调仓</div>`

              if (pt.rebalanceInfo) {
                const ri = pt.rebalanceInfo
                const fmtPct = (v: number) => v.toFixed(1) + '%'
                rightHtml += `<div style="color:#64748B;padding-left:8px;white-space:nowrap;">前: 股${fmtPct(ri.before.stock)} 债${fmtPct(ri.before.bond)} 金${fmtPct(ri.before.gold)}</div>`
                rightHtml += `<div style="color:#64748B;padding-left:8px;white-space:nowrap;">后: 股${fmtPct(ri.after.stock)} 债${fmtPct(ri.after.bond)} 金${fmtPct(ri.after.gold)}</div>`
                rightHtml += `<div style="color:#64748B;padding-left:8px;">成本 ¥${ri.tradeCost.toLocaleString()}</div>`
              }

              if (sells.length > 0) {
                for (const t of sells) {
                  rightHtml += `<div style="color:#94A3B8;padding-left:8px;white-space:nowrap;">- ${t.indexName} ¥${t.grossAmount.toLocaleString()}</div>`
                }
              }
              if (buys.length > 0) {
                for (const t of buys) {
                  rightHtml += `<div style="color:#94A3B8;padding-left:8px;white-space:nowrap;">+ ${t.indexName} ¥${t.grossAmount.toLocaleString()}</div>`
                }
              }
            }

            rightHtml += `</div>`
          }

          if (leftHtml) {
            html += leftHtml
            if (rightHtml) html += `<div style="width:1px;background:#334155;flex-shrink:0;"></div>`
          }
          if (rightHtml) html += rightHtml

          html += `</div>` // close two-column
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
