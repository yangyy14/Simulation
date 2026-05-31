import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Upload, Share2 } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import ConfigPanel from './components/ConfigPanel'
import KpiCards from './components/KpiCards'
import ValueChart from './components/ValueChart'
import TransactionTable from './components/TransactionTable'
import { loadIndexData, type PriceSeries } from './modules/data-loader'
import { runSimulation, type Strategy, type PortfolioSummary } from './modules/strategy'
import { encodeStrategy, decodeStrategy, hasStrategyInURL } from './modules/url-serializer'
import { useAutoSave, loadSavedStrategy } from './hooks/useAutoSave'

const INDEX_NAMES = [
  '上证50全收益',
  '沪深300全收益',
  '中证500全收益',
  '中证1000全收益',
  '中证红利全收益',
  'AU9999',
]

const DEFAULT_STRATEGY: Strategy = {
  segments: [],
  fees: { purchaseFee: 0, redemptionFee: 0, managementFee: 0 },
  evalWindow: { startDate: '2010-01-01', endDate: '2025-12-31' },
}

export default function App() {
  const [strategy, setStrategy] = useState<Strategy>(() => {
    // Priority: URL > localStorage > default
    if (hasStrategyInURL()) {
      const fromURL = decodeStrategy()
      if (fromURL) return fromURL
    }
    return loadSavedStrategy() ?? DEFAULT_STRATEGY
  })
  const [priceMap, setPriceMap] = useState<Map<string, PriceSeries>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-save to localStorage
  useAutoSave(strategy, !loading && !hasStrategyInURL())

  // Load data on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const map = new Map<string, PriceSeries>()
      const errors: string[] = []
      for (const name of INDEX_NAMES) {
        try {
          const series = await loadIndexData(name)
          if (!cancelled) map.set(name, series)
        } catch {
          errors.push(name)
        }
      }
      if (!cancelled) {
        setPriceMap(map)
        setLoadErrors(errors)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Run simulation
  const summary: PortfolioSummary | null = useMemo(() => {
    if (priceMap.size === 0 || strategy.segments.length === 0) return null
    return runSimulation(strategy, priceMap)
  }, [strategy, priceMap])

  // Export
  const handleExport = useCallback(() => {
    const json = JSON.stringify(strategy, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date().toISOString().split('T')[0]
    a.download = `定投策略_${today}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('策略已导出')
  }, [strategy])

  // Import
  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Strategy
      if (!parsed.segments || !parsed.fees || !parsed.evalWindow) {
        throw new Error('Invalid format')
      }
      setStrategy(parsed)
      toast.success('策略已导入')
    } catch {
      toast.error('无效的策略文件')
    }
  }, [])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => importJSON(reader.result as string)
    reader.readAsText(file)
    e.target.value = ''
  }, [importJSON])

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => importJSON(reader.result as string)
    reader.readAsText(file)
  }, [importJSON])

  // Share
  const handleShare = useCallback(() => {
    const url = encodeStrategy(strategy)
    navigator.clipboard.writeText(url).then(
      () => toast.success('链接已复制到剪贴板'),
      () => toast.error('复制失败'),
    )
  }, [strategy])

  return (
    <div
      className="min-h-screen bg-root text-text-primary font-ui"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toaster theme="dark" position="bottom-center" />
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-[100] bg-blue/10 border-2 border-dashed border-blue flex items-center justify-center">
          <div className="bg-surface border border-border rounded-xl p-8 shadow-2xl">
            <p className="text-text-primary text-lg font-semibold mb-1">释放文件以导入策略</p>
            <p className="text-text-secondary text-sm">支持 .json 格式的策略文件</p>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="h-14 flex items-center justify-between px-5 bg-surface border-b border-border sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue rounded-md flex items-center justify-center font-bold text-sm">
            D
          </div>
          <span className="font-semibold text-base tracking-tight">定投收益模拟</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleImport}>
            <Upload size={13} /> 导入
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExport}>
            <Download size={13} /> 导出
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={handleShare}>
            <Share2 size={13} /> 分享
          </Button>
        </div>
      </nav>

      {/* Main */}
      <main className="flex h-[calc(100vh-3.5rem-2rem)]">
        <ConfigPanel
          strategy={strategy}
          availableIndices={Array.from(priceMap.keys())}
          onChange={setStrategy}
          mobileOpen={mobileSidebar}
          onMobileToggle={() => setMobileSidebar(false)}
        />

        <section className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Mobile config toggle */}
          <button
            className="hidden max-md:flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary py-2"
            onClick={() => setMobileSidebar(true)}
          >
            <Upload size={14} className="rotate-180" /> 展开配置
          </button>

          {loading ? (
            <div className="flex flex-col gap-4 animate-pulse">
              <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-4 h-24" />
                ))}
              </div>
              <div className="bg-card border border-border rounded-lg p-5 h-80" />
              <div className="bg-card border border-border rounded-lg p-5 h-64" />
            </div>
          ) : strategy.segments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-text-muted text-sm">添加一个定投片段开始模拟</p>
            </div>
          ) : summary ? (
            <>
              <KpiCards
                summary={summary}
                transactionCount={summary.transactions.length}
                evalEndDate={strategy.evalWindow.endDate}
              />
              <ValueChart summary={summary} transactions={summary.transactions} priceMap={priceMap} />
              <TransactionTable
                summary={summary}
                transactions={summary.transactions}
                evalEndDate={strategy.evalWindow.endDate}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-text-muted text-sm">选择定投参数后将自动计算结果</p>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      {loadErrors.length > 0 && (
        <footer className="h-8 flex items-center justify-between px-5 bg-surface border-t border-border text-xs text-text-muted">
          <span>数据加载失败: {loadErrors.join(', ')}</span>
        </footer>
      )}
      <footer className="h-8 flex items-center justify-between px-5 bg-surface border-t border-border text-xs text-text-muted">
        <span>数据覆盖: 2004.01 — 2025.12</span>
        <div className="flex gap-3">
          {INDEX_NAMES.map((name) => (
            <span key={name} className={priceMap.has(name) ? '' : 'text-red/60 line-through'}>
              {name}
            </span>
          ))}
        </div>
      </footer>
    </div>
  )
}
