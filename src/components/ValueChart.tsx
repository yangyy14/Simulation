import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  priceMap: Map<string, IndexData>
  evalEndDate: string
}

export default function ValueChart({ summary, transactions, priceMap, evalEndDate }: Props) {
  const [showPE, setShowPE] = useState(false)

  const option = useMemo(() => {
    if (transactions.length === 0) return {}

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    const points: { date: string; cost: number; value: number }[] = []
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
        if (price !== null) mv += shares * price
      }
      points.push({ date: tx.date, cost: runningCost, value: mv })
    }

    // Terminal point
    if (points.length > 0) {
      let terminalMV = 0
      for (const [idxName, shares] of Object.entries(shareAcc)) {
        const series = priceMap.get(idxName)
        if (!series) continue
        const price = series.getPrice(evalEndDate)
        if (price !== null) terminalMV += shares * price
      }
      points.push({
        date: evalEndDate,
        cost: runningCost,
        value: terminalMV > 0 ? terminalMV : points[points.length - 1].value,
      })
    }

    const dates = points.map((p) => p.date)
    const costData = points.map((p) => p.cost)
    const valueData = points.map((p) => p.value)

    let crossoverIdx = -1
    for (let i = 0; i < points.length; i++) {
      if (valueData[i] >= costData[i]) {
        crossoverIdx = i
        break
      }
    }

    // PE data
    const firstSeries = priceMap.values().next().value as IndexData | undefined
    const peData = showPE && firstSeries
      ? dates.map((d) => (d ? firstSeries.getMetric(d) : null))
      : undefined

    const yAxes = showPE && peData
      ? [
          { type: 'value', axisLabel: { color: '#64748B', fontSize: 10, formatter: (v: number) => (v / 10000).toFixed(0) + '万' }, splitLine: { lineStyle: { color: '#1E293B' } } },
          { type: 'value', axisLabel: { color: '#64748B', fontSize: 10 }, splitLine: { show: false }, min: 0 },
        ]
      : [
          { type: 'value', axisLabel: { color: '#64748B', fontSize: 10, formatter: (v: number) => (v / 10000).toFixed(0) + '万' }, splitLine: { lineStyle: { color: '#1E293B' } } },
        ]

    const series: object[] = [
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
    ]

    if (crossoverIdx >= 0) {
      series.push({
        name: '回本节点',
        type: 'scatter',
        data: [[dates[crossoverIdx], valueData[crossoverIdx]]],
        symbolSize: 10,
        itemStyle: { color: '#F59E0B' },
        symbol: 'pin',
        label: { show: true, position: 'top', color: '#F59E0B', fontSize: 11, formatter: '市值超越成本' },
      })
    }

    if (peData) {
      series.push({
        name: '市盈率',
        type: 'line',
        yAxisIndex: 1,
        data: peData,
        smooth: false,
        lineStyle: { color: '#F59E0B', width: 1, type: 'dotted' },
        itemStyle: { color: '#F59E0B' },
        symbol: 'none',
      })
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
            const val = p.seriesName === '市盈率' ? p.value.toFixed(2) : `¥ ${p.value.toLocaleString()}`
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <span style="font-family:Fira Code;font-weight:600;">${val}</span></div>`
          }
          return html
        },
      },
      legend: {
        data: ['期末总市值', '累计投入成本', ...(peData ? ['市盈率'] : [])],
        top: 0,
        textStyle: { color: '#94A3B8', fontSize: 12 },
      },
      grid: { left: 60, right: peData ? 60 : 20, top: 40, bottom: 60 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      yAxis: yAxes,
      dataZoom: [
        { type: 'slider', bottom: 10, height: 20, borderColor: '#334155', backgroundColor: '#0F172A', dataBackground: { lineStyle: { color: '#334155' }, areaStyle: { color: '#1E293B' } } },
      ],
      series,
    }
  }, [summary, transactions, priceMap, evalEndDate, showPE])

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted" />
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
          <input type="checkbox" checked={showPE} onChange={(e) => setShowPE(e.target.checked)} className="accent-gold" />
          PE 分位参考线
        </label>
      </div>
      {transactions.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-text-muted text-sm">暂无数据</div>
      ) : (
        <ReactECharts option={option} style={{ height: 340 }} opts={{ renderer: 'canvas' }} />
      )}
    </div>
  )
}
