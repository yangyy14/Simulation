import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary, Strategy } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'
import { computeStockWeight } from '@/modules/l2-allocator'
import { getAssetCategory } from '@/App'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  priceMap: Map<string, IndexData>
  evalEndDate: string
  l2Config?: Strategy['l2Config']
}

export default function ValueChart({ summary, transactions, priceMap, evalEndDate }: Props) {
  const option = useMemo(() => {
    if (transactions.length === 0) return {}

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    interface L2Info {
      spread: number
      adjStockWeight: number
      staticStockWeight: number
    }

    interface Point {
      date: string; cost: number; value: number
      breakdown?: { stock: number; bond: number; gold: number; sub: { aStock: number; usStock: number } }
      l2Info?: L2Info
    }

    const points: Point[] = []
    let runningCost = 0
    const shareAcc: Record<string, number> = {}

    for (const tx of sorted) {
      runningCost += tx.grossAmount
      shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares
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
      // L2 info at this point
      let l2Info: L2Info | undefined
      if (l2Config) {
        const aStockNames = Object.keys(shareAcc).filter((n) => {
          const c = getAssetCategory(n); return c.category === 'stock' && c.subCategory === 'a-stock'
        })
        const bondNames = Object.keys(shareAcc).filter((n) => getAssetCategory(n).category === 'bond')
        if (aStockNames.length > 0 && bondNames.length > 0) {
          const stockIdx = aStockNames[0]
          const bondIdx = bondNames.find((n) => n.includes('3-5')) || bondNames[0]
          const stockData = priceMap.get(stockIdx!)
          const bondData = priceMap.get(bondIdx!)
          if (stockData && bondData) {
            const sw = aStockNames.reduce((s, n) => s + (shareAcc[n] || 0) * (stockData.getPrice(tx.date) || 0), 0) / (mv || 1)
            const result = computeStockWeight(stockData, bondData, tx.date, sw, l2Config)
            if (result && result.stockWeight !== sw) {
              const pe = stockData.getMetric(tx.date)
              const ytm = bondData.getMetric(tx.date)
              if (pe && ytm) {
                l2Info = { spread: (1 / pe - ytm / 100) * 100, adjStockWeight: result.stockWeight, staticStockWeight: sw }
              }
            }
          }
        }
      }

      points.push({ date: tx.date, cost: runningCost, value: mv, breakdown, l2Info })
    }

    // Deduplicate by date — keep last point per date (portfolio mode creates
    // multiple transactions on the same date, one per allocation)
    const uniquePoints: Point[] = []
    for (const pt of points) {
      const last = uniquePoints[uniquePoints.length - 1]
      if (last && last.date === pt.date) {
        uniquePoints[uniquePoints.length - 1] = pt
      } else {
        uniquePoints.push(pt)
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
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <span style="font-family:Fira Code;font-weight:600;">¥ ${p.value.toLocaleString()}</span></div>`
          }
          // Show cumulative return at this point
          const idx = arr[0]?.dataIndex
          if (idx !== undefined && idx < uniquePoints.length) {
            const pt = uniquePoints[idx]
            if (pt.cost > 0) {
              const ret = (pt.value - pt.cost) / pt.cost
              const sign = ret >= 0 ? '+' : ''
              html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;">累计收益率</span> <span style="font-family:Fira Code;font-weight:600;color:${ret >= 0 ? '#EF4444' : '#22C55E'};">${sign}${(ret * 100).toFixed(2)}%</span></div>`
            }

            // Show asset allocation when multiple categories present
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

              if (categories.length >= 2) {
                html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;font-size:11px;">资产配置</span>`
                for (const cat of categories) {
                  html += `<div style="font-size:11px;color:#94A3B8;">  ${cat.label}</div>`
                }
                html += `</div>`
              }
            }

            // Show L2 info when active
            if (pt.l2Info) {
              const li = pt.l2Info
              html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #334155;"><span style="color:#64748B;font-size:11px;">L2 动态权重</span>`
              html += `<div style="font-size:11px;color:#94A3B8;">  股债收益差: ${li.spread.toFixed(1)}%</div>`
              html += `<div style="font-size:11px;color:#94A3B8;">  股票占比: ${(li.adjStockWeight * 100).toFixed(0)}% (静态 ${(li.staticStockWeight * 100).toFixed(0)}%)</div>`
              html += `</div>`
            }
          }
          return html
        },
      },
      legend: {
        data: ['期末总市值', '累计投入成本'],
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
