import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Transaction, PortfolioSummary } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  evalEndDate: string
  priceMap: Map<string, IndexData>
}

export default function ResultTabs({ summary, transactions, evalEndDate, priceMap }: Props) {
  const [tab, setTab] = useState<'table' | 'index'>('table')

  const indexChartOption = useMemo(() => {
    if (transactions.length === 0) return {}

    // Group transactions by index, get price series for each
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
    const indexNames = [...new Set(sorted.map((tx) => tx.indexName))]

    // For each index, plot its price line over the transaction date range
    const firstDate = sorted[0].date
    const lastDate = evalEndDate || sorted[sorted.length - 1].date

    const series: object[] = []
    const colors = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#EC4899']

    for (let idx = 0; idx < indexNames.length; idx++) {
      const name = indexNames[idx]
      const series_data = priceMap.get(name)
      if (!series_data) continue

      // Build monthly price data points
      const priceLine: [string, number][] = []
      const buyMarkers: [string, number][] = []
      const buyDates = new Set(sorted.filter((tx) => tx.indexName === name).map((tx) => tx.date))

      for (let y = 2004; y <= 2026; y++) {
        for (let m = 1; m <= 12; m++) {
          const d = `${y}-${String(m).padStart(2, '0')}-01`
          if (d < firstDate) continue
          if (d > lastDate) break
          const p = series_data.getPrice(d)
          if (p !== null) {
            priceLine.push([d, p])
            if (buyDates.has(d)) {
              buyMarkers.push([d, p])
            }
          }
        }
      }

      // Also check non-1st dates for buy markers
      for (const buyDate of buyDates) {
        if (!priceLine.some(([d]) => d === buyDate)) {
          const p = series_data.getPrice(buyDate)
          if (p !== null) buyMarkers.push([buyDate, p])
        }
      }

      series.push({
        name: `${name} 走势`,
        type: 'line',
        data: priceLine,
        smooth: false,
        lineStyle: { color: colors[idx % colors.length], width: 1.5 },
        itemStyle: { color: colors[idx % colors.length] },
        symbol: 'none',
        connectNulls: true,
      })

      if (buyMarkers.length > 0) {
        series.push({
          name: `${name} 买入`,
          type: 'scatter',
          data: buyMarkers,
          symbolSize: 6,
          itemStyle: { color: colors[idx % colors.length], borderColor: '#020617', borderWidth: 1.5 },
          z: 5,
        })
      }
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0F172A',
        borderColor: '#475569',
        textStyle: { color: '#F8FAFC', fontSize: 12, fontFamily: 'IBM Plex Sans' },
      },
      legend: {
        top: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 50 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      dataZoom: [
        { type: 'slider', bottom: 10, height: 20, borderColor: '#334155', backgroundColor: '#0F172A', dataBackground: { lineStyle: { color: '#334155' }, areaStyle: { color: '#1E293B' } } },
      ],
      series,
    }
  }, [transactions, evalEndDate, priceMap])

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('table')}
            className={`px-3 py-1 text-xs rounded transition-colors ${tab === 'table' ? 'bg-blue text-white' : 'text-text-secondary hover:text-text-primary'}`}
          >
            定投明细
          </button>
          <button
            type="button"
            onClick={() => setTab('index')}
            className={`px-3 py-1 text-xs rounded transition-colors ${tab === 'index' ? 'bg-blue text-white' : 'text-text-secondary hover:text-text-primary'}`}
          >
            指数走势
          </button>
        </div>
        <span className="text-xs text-text-muted">共 {transactions.length} 笔</span>
      </div>

      {tab === 'index' ? (
        <div className="p-5">
          {transactions.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-text-muted text-sm">暂无数据</div>
          ) : (
            <ReactECharts option={indexChartOption} style={{ height: 360 }} opts={{ renderer: 'canvas' }} />
          )}
        </div>
      ) : (
        <TransactionTableInner transactions={transactions} evalEndDate={evalEndDate} priceMap={priceMap} summary={summary} />
      )}
    </div>
  )
}

// Inline transaction table (extracted from TransactionTable.tsx)
function TransactionTableInner({ transactions, evalEndDate, priceMap, summary }: Props) {
  const [sortField, setSortField] = useState<'date' | 'indexName' | 'type' | 'source' | 'price' | 'shares' | 'grossAmount' | 'currentValue' | 'pnl'>('date')
  const [sortAsc, setSortAsc] = useState(false)

  const enriched = useMemo(() => {
    return transactions.map((tx) => {
      const series = priceMap.get(tx.indexName)
      const currentPrice = series?.getPrice(evalEndDate)
      const currentValue = currentPrice !== null && currentPrice !== undefined ? tx.shares * currentPrice : 0
      const pnl = tx.type === 'buy' && tx.grossAmount > 0 ? (currentValue - tx.grossAmount) / tx.grossAmount : 0
      return { ...tx, currentValue, pnl }
    })
  }, [transactions, evalEndDate, priceMap])

  const sorted = useMemo(() => {
    const arr = [...enriched]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'date': cmp = a.date.localeCompare(b.date); break
        case 'indexName': cmp = a.indexName.localeCompare(b.indexName); break
        case 'type': cmp = a.type.localeCompare(b.type); break
        case 'source': cmp = a.source.localeCompare(b.source); break
        case 'price': cmp = a.price - b.price; break
        case 'shares': cmp = a.shares - b.shares; break
        case 'grossAmount': cmp = a.grossAmount - b.grossAmount; break
        case 'currentValue': cmp = a.currentValue - b.currentValue; break
        case 'pnl': cmp = a.pnl - b.pnl; break
      }
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [enriched, sortField, sortAsc])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  return (
    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {(['date','indexName','type','source','price','shares','grossAmount','currentValue','pnl'] as const).map((f) => (
              <th key={f} className="px-3 py-2 text-left text-xs font-semibold text-text-secondary bg-root border-b border-border cursor-pointer select-none hover:text-text-primary sticky top-0 whitespace-nowrap"
                onClick={() => toggleSort(f)}>
                {{date:'日期',indexName:'指数',type:'方向',source:'来源',price:'净值',shares:'份额',grossAmount:'金额',currentValue:'当前市值',pnl:'盈亏'}[f]}
                {' '}{sortField === f ? (sortAsc ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((tx, i) => (
            <tr key={i} className={`hover:bg-white/[0.02] ${tx.source === 'rebalance' ? 'bg-amber-500/8' : ''}`}>
              <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">{tx.date}</td>
              <td className="px-3 py-2 whitespace-nowrap">{tx.indexName}</td>
              <td className={`px-3 py-2 whitespace-nowrap text-xs ${tx.type === 'sell' ? 'text-green' : 'text-red'}`}>
                {tx.type === 'sell' ? '卖出' : '买入'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs text-text-muted">
                {tx.source === 'rebalance' ? '调仓' : '定投'}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">{tx.price.toFixed(2)}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{tx.type === 'sell' ? '-' : ''}{tx.shares.toFixed(2)}</td>
              <td className="px-3 py-2 font-mono tabular-nums">¥ {tx.grossAmount.toLocaleString()}</td>
              <td className="px-3 py-2 font-mono tabular-nums">¥ {tx.currentValue.toLocaleString()}</td>
              <td className={`px-3 py-2 font-mono tabular-nums ${tx.type === 'sell' ? 'text-text-muted' : tx.pnl >= 0 ? 'text-red' : 'text-green'}`}>
                {tx.type === 'sell' ? '—' : `${tx.pnl >= 0 ? '+' : ''}${(tx.pnl * 100).toFixed(2)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
