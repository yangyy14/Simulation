import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary } from '@/modules/strategy'
import type { PriceSeries } from '@/modules/data-loader'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  priceMap: Map<string, PriceSeries>
}

export default function ValueChart({ summary, transactions, priceMap }: Props) {
  const option = useMemo(() => {
    if (transactions.length === 0) return {}

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    interface Point { date: string; cost: number; value: number }

    const points: Point[] = []
    let runningCost = 0
    const shareAcc: Record<string, number> = {}

    for (const tx of sorted) {
      runningCost += tx.grossAmount
      shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares

      let mv = 0
      for (const [idxName, shares] of Object.entries(shareAcc)) {
        const series = priceMap.get(idxName)
        if (!series) continue
        const price = series.getPrice(tx.date)
        if (price !== null) {
          mv += shares * price
        }
      }
      points.push({ date: tx.date, cost: runningCost, value: mv })
    }

    // Add final end-date point with fees applied
    if (points.length > 0) {
      points.push({
        date: '',
        cost: runningCost,
        value: summary.marketValue,
      })
    }

    const dates = points.map((p) => p.date)
    const costData = points.map((p) => p.cost)
    const valueData = points.map((p) => p.value)

    // Find crossover index
    let crossoverIdx = -1
    for (let i = 0; i < points.length; i++) {
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
          const date = arr[0]?.name || ''
          let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">${date}</div>`
          for (const p of arr) {
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <span style="font-family:Fira Code;font-weight:600;">¥ ${p.value.toLocaleString()}</span></div>`
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
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
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
          data: [[dates[crossoverIdx], valueData[crossoverIdx]]],
          symbolSize: 10,
          itemStyle: { color: '#F59E0B' },
          symbol: 'pin',
          label: { show: true, position: 'top', color: '#F59E0B', fontSize: 11, formatter: '市值超越成本' },
        }] : []),
      ] as object[],
    }
  }, [summary, transactions, priceMap])

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
