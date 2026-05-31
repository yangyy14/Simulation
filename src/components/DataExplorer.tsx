import { useState, useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { loadIndexData, type IndexData } from '@/modules/data-loader'

function PEChart({ priceSeries, trSeries }: { priceSeries: IndexData | null; trSeries: IndexData | null }) {
  const option = useMemo(() => {
    const source = trSeries || priceSeries
    if (!source) return {}
    const dates: string[] = []
    const peData: (number | null)[] = []
    for (let y = 2004; y <= 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        const d = `${y}-${String(m).padStart(2, '0')}-01`
        const pe = source.getMetric(d)
        if (pe !== null) {
          dates.push(d)
          peData.push(pe)
        }
      }
    }
    if (dates.length === 0) return {}

    // Add percentile line
    const sorted = [...peData].filter((v): v is number => v !== null).sort((a, b) => a - b)
    const p30 = sorted[Math.floor(sorted.length * 0.3)]
    const p70 = sorted[Math.floor(sorted.length * 0.7)]

    return {
      backgroundColor: 'transparent',
      title: { text: '市盈率 (PE) 历史走势', left: 'center', textStyle: { color: '#94A3B8', fontSize: 12, fontWeight: 400 } },
      tooltip: { trigger: 'axis', backgroundColor: '#0F172A', borderColor: '#475569', textStyle: { color: '#F8FAFC', fontSize: 12 } },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#64748B', fontSize: 10, interval: 23 }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748B', fontSize: 10 }, splitLine: { lineStyle: { color: '#1E293B' } }, name: 'PE', nameTextStyle: { color: '#64748B', fontSize: 10 } },
      series: [
        { name: '市盈率', type: 'line', data: peData, smooth: false, lineStyle: { color: '#F59E0B', width: 1.5 }, itemStyle: { color: '#F59E0B' }, symbol: 'none' },
        ...(p30 !== undefined ? [{ name: '30%分位', type: 'line' as const, data: Array(dates.length).fill(p30), lineStyle: { color: '#22C55E', width: 1, type: 'dashed' as const }, itemStyle: { color: '#22C55E' }, symbol: 'none', label: { show: true, position: 'end', color: '#22C55E', fontSize: 9, formatter: `30%: ${p30?.toFixed(1)}` } }] : []),
        ...(p70 !== undefined ? [{ name: '70%分位', type: 'line' as const, data: Array(dates.length).fill(p70), lineStyle: { color: '#EF4444', width: 1, type: 'dashed' as const }, itemStyle: { color: '#EF4444' }, symbol: 'none', label: { show: true, position: 'end', color: '#EF4444', fontSize: 9, formatter: `70%: ${p70?.toFixed(1)}` } }] : []),
      ],
      dataZoom: [{ type: 'slider', bottom: 5, height: 16, borderColor: '#334155', backgroundColor: '#0F172A' }],
    }
  }, [priceSeries, trSeries])

  return <ReactECharts option={option} style={{ height: 300 }} opts={{ renderer: 'canvas' }} />
}

const PAIRS: { label: string; priceFile: string; trFile: string }[] = [
  { label: '上证50', priceFile: '上证50价格指数', trFile: '上证50全收益' },
  { label: '沪深300', priceFile: '沪深300价格指数', trFile: '沪深300全收益' },
  { label: '中证500', priceFile: '中证500价格指数', trFile: '中证500全收益' },
  { label: '中证1000', priceFile: '中证1000价格指数', trFile: '中证1000全收益' },
  { label: '中证红利', priceFile: '中证红利价格指数', trFile: '中证红利全收益' },
  { label: '黄金', priceFile: 'AU9999', trFile: 'AU9999' },
]

export default function DataExplorer() {
  const [selected, setSelected] = useState(PAIRS[1]) // default 沪深300
  const [priceSeries, setIndexData] = useState<IndexData | null>(null)
  const [trSeries, setTrSeries] = useState<IndexData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      loadIndexData(selected.priceFile).catch(() => null),
      loadIndexData(selected.trFile).catch(() => null),
    ]).then(([p, tr]) => {
      if (cancelled) return
      setIndexData(p)
      setTrSeries(tr)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected])

  const option = useMemo(() => {
    if (!priceSeries && !trSeries) return {}

    // Sample ~500 evenly-spaced data points for performance
    const dates: string[] = []
    const priceData: (number | null)[] = []
    const trData: (number | null)[] = []

    // Generate monthly points from 2004 to 2026
    for (let y = 2004; y <= 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        const d = `${y}-${String(m).padStart(2, '0')}-01`
        const dp = priceSeries?.getPrice(d) ?? null
        const dt = trSeries?.getPrice(d) ?? null
        if (dp !== null || dt !== null) {
          dates.push(d)
          priceData.push(dp)
          trData.push(dt)
        }
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
          let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">${arr[0]?.axisValue}</div>`
          for (const p of arr) {
            if (p.value == null) continue
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <span style="font-family:Fira Code;font-weight:600;">${Number(p.value).toFixed(2)}</span></div>`
          }
          return html
        },
      },
      legend: {
        data: ['全收益指数', '价格指数'],
        top: 0,
        textStyle: { color: '#94A3B8', fontSize: 12 },
      },
      grid: { left: 70, right: 20, top: 40, bottom: 50 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          interval: 23, // ~yearly labels
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1E293B' } },
      },
      dataZoom: [
        {
          type: 'slider',
          bottom: 10,
          height: 20,
          borderColor: '#334155',
          backgroundColor: '#0F172A',
          dataBackground: {
            lineStyle: { color: '#334155' },
            areaStyle: { color: '#1E293B' },
          },
        },
      ],
      series: [
        {
          name: '全收益指数',
          type: 'line',
          data: trData,
          smooth: false,
          lineStyle: { color: '#22C55E', width: 1.5 },
          itemStyle: { color: '#22C55E' },
          symbol: 'none',
          connectNulls: true,
        },
        {
          name: '价格指数',
          type: 'line',
          data: priceData,
          smooth: false,
          lineStyle: { color: '#3B82F6', width: 1.5 },
          itemStyle: { color: '#3B82F6' },
          symbol: 'none',
          connectNulls: true,
        },
      ],
    }
  }, [priceSeries, trSeries])

  const latest = useMemo(() => {
    if (!priceSeries || !trSeries) return null
    // Find last valid price for comparison
    const p = priceSeries.getPrice('2026-05-01')
    const t = trSeries.getPrice('2026-05-01')
    if (!p || !t) return null
    const ratio = ((t / p - 1) * 100)
    return { price: p, tr: t, ratio }
  }, [priceSeries, trSeries])

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-secondary">选择指数：</span>
        <div className="flex gap-1 flex-wrap">
          {PAIRS.map((pair) => (
            <button
              key={pair.label}
              type="button"
              onClick={() => setSelected(pair)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                selected.label === pair.label
                  ? 'bg-blue text-white'
                  : 'bg-card border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {pair.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-96 bg-card border border-border rounded-lg flex items-center justify-center text-text-muted text-sm">
          加载中…
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg p-5">
            <ReactECharts option={option} style={{ height: 420 }} opts={{ renderer: 'canvas' }} />
          </div>

          {latest && (
            <div className="bg-card border border-border rounded-lg p-4">
              <span className="text-xs text-text-secondary">
                截至最近数据：价格指数 <span className="font-mono text-blue-light">{latest.price.toFixed(2)}</span>，
                全收益指数 <span className="font-mono text-green">{latest.tr.toFixed(2)}</span>，
                分红复利贡献 <span className="font-mono text-gold">+{latest.ratio.toFixed(1)}%</span>
              </span>
            </div>
          )}

          {/* PE history chart (stock indices only, not gold) */}
          {selected.label !== '黄金' && (
            <div className="bg-card border border-border rounded-lg p-5">
              <PEChart priceSeries={priceSeries} trSeries={trSeries} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
