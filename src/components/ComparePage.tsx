import { useState, useMemo, useRef, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Upload, X, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { runSimulation, validateStrategy, type Strategy, type PortfolioSummary } from '@/modules/strategy'
import type { IndexData } from '@/modules/data-loader'

const MAX_PORTFOLIOS = 6
const PALETTE = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4']

interface CompareItem {
  id: number
  name: string
  strategy: Strategy
  summary: PortfolioSummary
}

interface Props {
  priceMap: Map<string, IndexData>
  availableIndices: string[]
}

export default function ComparePage({ priceMap, availableIndices }: Props) {
  const [items, setItems] = useState<CompareItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)

  const importJSON = useCallback((json: string, fileName: string) => {
    try {
      const parsed = JSON.parse(json) as Strategy
      if (!parsed.segments || !parsed.fees || !parsed.evalWindow) {
        throw new Error('Invalid format')
      }
      const err = validateStrategy(parsed, availableIndices)
      if (err) throw new Error(err)

      if (items.length >= MAX_PORTFOLIOS) {
        alert(`最多对比 ${MAX_PORTFOLIOS} 个组合`)
        return
      }

      const summary = runSimulation(parsed, priceMap)
      if (!summary || summary.transactions.length === 0) {
        throw new Error('策略无有效交易')
      }

      const baseName = fileName.replace(/\.json$/i, '')
      idRef.current += 1
      setItems(prev => [...prev, {
        id: idRef.current,
        name: baseName,
        strategy: parsed,
        summary,
      }])
    } catch (e) {
      alert(e instanceof Error ? e.message : '无效的策略文件')
    }
  }, [items.length, priceMap, availableIndices])

  const removeItem = useCallback((id: number) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const startRename = useCallback((item: CompareItem) => {
    setEditingId(item.id)
    setEditName(item.name)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId !== null && editName.trim()) {
      setItems(prev => prev.map(i => i.id === editingId ? { ...i, name: editName.trim() } : i))
    }
    setEditingId(null)
  }, [editingId, editName])

  // ── Chart ──
  const chartOption = useMemo(() => {
    if (items.length === 0) return {}

    // Find the full date range across all portfolios
    let minDate = ''
    let maxDate = ''
    const series: object[] = []

    items.forEach((item, idx) => {
      const txs = [...item.summary.transactions].sort((a, b) => a.date.localeCompare(b.date))
      if (txs.length === 0) return

      if (!minDate || txs[0].date < minDate) minDate = txs[0].date
      if (!maxDate || txs[txs.length - 1].date > maxDate) maxDate = txs[txs.length - 1].date

      // Build MV series by accumulating shares
      const shareAcc: Record<string, number> = {}
      const data: [string, number][] = []

      for (const tx of txs) {
        if (tx.type === 'buy') {
          shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) + tx.shares
        } else {
          shareAcc[tx.indexName] = (shareAcc[tx.indexName] || 0) - tx.shares
        }
        let mv = 0
        for (const [idxName, shares] of Object.entries(shareAcc)) {
          const s = priceMap.get(idxName)
          if (!s) continue
          const price = s.getPrice(tx.date)
          if (price !== null) mv += shares * price
        }
        data.push([tx.date, mv])
      }

      // Extend to evalEnd
      const evalEnd = item.strategy.evalWindow.endDate
      if (data.length > 0 && data[data.length - 1][0] < evalEnd) {
        let terminalMV = 0
        for (const [idxName, shares] of Object.entries(shareAcc)) {
          const s = priceMap.get(idxName)
          if (!s) continue
          const price = s.getPrice(evalEnd)
          if (price !== null) terminalMV += shares * price
        }
        if (terminalMV > 0) data.push([evalEnd, terminalMV])
      }

      if (data.length > 0) {
        if (!maxDate || data[data.length - 1][0] > maxDate) maxDate = data[data.length - 1][0]
      }

      series.push({
        name: item.name,
        type: 'line',
        data,
        smooth: true,
        lineStyle: { color: PALETTE[idx % PALETTE.length], width: 2 },
        itemStyle: { color: PALETTE[idx % PALETTE.length] },
        symbol: 'none',
      })
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0F172A',
        borderColor: '#475569',
        textStyle: { color: '#F8FAFC', fontSize: 12, fontFamily: 'IBM Plex Sans' },
        formatter: (params: any) => {
          const arr = Array.isArray(params) ? params : [params]
          let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">${arr[0]?.axisValue || ''}</div>`
          for (const p of arr) {
            if (p.value == null) continue
            const amount = Array.isArray(p.value) ? p.value[1] : p.value
            html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}<br><span style="font-family:Fira Code;font-weight:600;padding-left:14px;">¥ ${Number(amount).toLocaleString()}</span></div>`
          }
          return html
        },
      },
      legend: {
        data: items.map(i => i.name),
        top: 0,
        textStyle: { color: '#94A3B8', fontSize: 12 },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 60 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        min: minDate,
        max: maxDate,
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
      series,
    }
  }, [items, priceMap])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => importJSON(reader.result as string, file.name)
    reader.readAsText(file)
  }, [importJSON])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      for (let i = 0; i < files.length; i++) handleFile(files[i])
    }
    e.target.value = ''
  }, [handleFile])

  const fmtPct = (v: number | null) => {
    if (v === null || v === undefined) return '—'
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%'
  }

  const fmtNum = (v: number | null) => {
    if (v === null || v === undefined) return '—'
    return v.toFixed(2)
  }

  return (
    <div
      className="flex-1 p-5 flex flex-col gap-5 min-h-0"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} multiple />

      {dragOver && (
        <div className="fixed inset-0 z-[100] bg-blue/10 border-2 border-dashed border-blue flex items-center justify-center">
          <div className="bg-surface border border-border rounded-xl p-8 shadow-2xl">
            <p className="text-text-primary text-lg font-semibold mb-1">释放文件以添加对比</p>
            <p className="text-text-secondary text-sm">支持 .json 格式的策略文件（最多 {MAX_PORTFOLIOS} 个）</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">组合对比</h2>
          <p className="text-xs text-text-muted mt-0.5">导入策略 JSON 文件，对比不同组合的长期表现（最多 {MAX_PORTFOLIOS} 个）</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Upload size={13} /> 导入策略
        </Button>
      </div>

      {/* KPI Table */}
      {items.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden flex-1 min-h-[200px]">
          <div className="overflow-x-auto overflow-y-auto h-full">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root">组合</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[90px]">累计收益</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[90px]">年化收益率</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[90px]">最大回撤</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[90px]">年化波动率</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[80px]">收益回撤比</th>
                  <th className="px-3 py-3 text-right font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root min-w-[80px]">最长回撤(天)</th>
                  <th className="px-3 py-3 text-center font-semibold text-text-secondary bg-root border-b border-border whitespace-nowrap sticky top-0 bg-root">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const s = item.summary
                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] border-b border-border/50">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {editingId === item.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
                            className="h-7 w-32 text-xs bg-surface border-border font-mono"
                            autoFocus
                          />
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: PALETTE[items.indexOf(item) % PALETTE.length] }}
                            />
                            {item.name}
                            <button onClick={() => startRename(item)} className="text-text-muted hover:text-text-primary">
                              <Pencil size={11} />
                            </button>
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap ${s.cumulativeReturn >= 0 ? 'text-red' : 'text-green'}`}>
                        {fmtPct(s.cumulativeReturn)}
                      </td>
                      <td className={`px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap ${(s.xirr ?? 0) >= 0 ? 'text-red' : 'text-green'}`}>
                        {fmtPct(s.xirr)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right whitespace-nowrap text-text-primary">
                        {fmtPct(s.maxDrawdown)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right whitespace-nowrap text-text-primary">
                        {fmtPct(s.annualVolatility)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right whitespace-nowrap text-text-primary">
                        {fmtNum(s.calmarRatio)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right whitespace-nowrap text-text-primary">
                        {s.longestDrawdownDays}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button onClick={() => removeItem(item.id)} className="text-text-muted hover:text-red p-1 rounded transition-colors">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart */}
      {items.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 flex-shrink-0">
          <ReactECharts option={chartOption} style={{ height: 400 }} opts={{ renderer: 'canvas' }} />
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-text-muted text-sm mb-2">暂无对比组合</p>
            <p className="text-text-muted text-xs">拖放策略 JSON 文件或点击"导入策略"开始对比</p>
          </div>
        </div>
      )}
    </div>
  )
}
