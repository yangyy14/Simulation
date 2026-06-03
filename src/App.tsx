import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Upload, Share2, Play } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import ConfigPanel from './components/ConfigPanel'
import KpiCards from './components/KpiCards'
import ValueChart from './components/ValueChart'
import ResultTabs from './components/ResultTabs'
import DataExplorer from './components/DataExplorer'
import { loadIndexData, type IndexData } from './modules/data-loader'
import { runSimulation, validateStrategy, type Strategy, type PortfolioSummary } from './modules/strategy'
import { encodeStrategy, decodeStrategy, hasStrategyInURL } from './modules/url-serializer'
import { useAutoSave, loadSavedStrategy } from './hooks/useAutoSave'

export interface AssetCategory {
  category: 'stock' | 'bond' | 'gold'
  subCategory: 'a-stock' | 'us-stock' | null
}

export interface AssetGroup {
  label: string
  indices: string[]
}

const INDEX_META: Record<string, AssetCategory> = {
  '上证50全收益':   { category: 'stock', subCategory: 'a-stock' },
  '沪深300全收益':  { category: 'stock', subCategory: 'a-stock' },
  '中证500全收益':  { category: 'stock', subCategory: 'a-stock' },
  '中证1000全收益': { category: 'stock', subCategory: 'a-stock' },
  '中证红利全收益': { category: 'stock', subCategory: 'a-stock' },
  '标普500':       { category: 'stock', subCategory: 'us-stock' },
  '纳斯达克100':    { category: 'stock', subCategory: 'us-stock' },
  '国债1-3年':      { category: 'bond', subCategory: null },
  '国债3-5年':      { category: 'bond', subCategory: null },
  '国债5-7年':      { category: 'bond', subCategory: null },
  'AU9999':        { category: 'gold', subCategory: null },
}

export function getAssetCategory(indexName: string): AssetCategory {
  return INDEX_META[indexName] ?? { category: 'stock', subCategory: 'a-stock' }
}

export function hasPE(indexName: string): boolean {
  const meta = INDEX_META[indexName]
  if (!meta) return false
  return meta.category === 'stock' && meta.subCategory === 'a-stock'
}

export function canSmartDCA(indexName: string): boolean {
  const meta = INDEX_META[indexName]
  if (!meta) return false
  return meta.category === 'stock' && meta.subCategory === 'a-stock'
}

const GROUP_ORDER: { label: string; filter: (meta: AssetCategory) => boolean }[] = [
  { label: 'A股', filter: (m) => m.category === 'stock' && m.subCategory === 'a-stock' },
  { label: '债券', filter: (m) => m.category === 'bond' },
  { label: '美股', filter: (m) => m.category === 'stock' && m.subCategory === 'us-stock' },
  { label: '黄金', filter: (m) => m.category === 'gold' },
]

export function getAssetGroups(): AssetGroup[] {
  const remaining = new Set(Object.keys(INDEX_META))
  const groups: AssetGroup[] = []
  for (const g of GROUP_ORDER) {
    const indices: string[] = []
    for (const name of remaining) {
      if (g.filter(INDEX_META[name])) {
        indices.push(name)
      }
    }
    for (const n of indices) remaining.delete(n)
    if (indices.length > 0) groups.push({ label: g.label, indices })
  }
  return groups
}

const INDEX_NAMES = Object.keys(INDEX_META)

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
      if (fromURL && !validateStrategy(fromURL, INDEX_NAMES)) return fromURL
    }
    const saved = loadSavedStrategy()
    if (saved && !validateStrategy(saved, INDEX_NAMES)) return saved
    return DEFAULT_STRATEGY
  })
  // Committed strategy = what was last computed. Only updates on explicit "计算".
  const [committedStrategy, setCommittedStrategy] = useState(strategy)
  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(strategy) !== JSON.stringify(committedStrategy)
  }, [strategy, committedStrategy])
  const [priceMap, setPriceMap] = useState<Map<string, IndexData>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [page, setPage] = useState<'sim' | 'data'>('sim')
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
      const map = new Map<string, IndexData>()
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

  // Find latest data date across all loaded indices
  const maxDataDate = useMemo(() => {
    let latest = ''
    for (const series of priceMap.values()) {
      const d = series.getLatestDate()
      if (d && d > latest) latest = d
    }
    return latest || '2025-12-31'
  }, [priceMap])

  // Clamp strategy dates to data range
  useEffect(() => {
    if (!maxDataDate || loading) return
    let needsUpdate = false
    const clamped = { ...strategy }
    if (strategy.evalWindow.endDate > maxDataDate) {
      clamped.evalWindow = { ...strategy.evalWindow, endDate: maxDataDate }
      needsUpdate = true
    }
    const segs = strategy.segments.map((s) => {
      if (s.endDate > maxDataDate) {
        needsUpdate = true
        return { ...s, endDate: maxDataDate }
      }
      return s
    })
    if (needsUpdate) {
      const updated = { ...strategy, evalWindow: clamped.evalWindow, segments: segs }
      setStrategy(updated)
      setCommittedStrategy(updated)
      toast('日期已自动调整为数据最新日期')
    }
  }, [maxDataDate, loading])

  // Run simulation on committed strategy only
  const summary: PortfolioSummary | null = useMemo(() => {
    if (priceMap.size === 0 || committedStrategy.segments.length === 0) return null
    return runSimulation(committedStrategy, priceMap)
  }, [committedStrategy, priceMap])

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
      const err = validateStrategy(parsed, INDEX_NAMES)
      if (err) throw new Error(err)
      setStrategy(parsed)
      setCommittedStrategy(parsed) // auto-commit on import
      toast.success('策略已导入')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '无效的策略文件')
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

  // Compute
  const handleCompute = useCallback(() => {
    const err = validateStrategy(strategy, INDEX_NAMES)
    if (err) {
      toast.error(err)
      return
    }
    // Check if L2 is enabled but bond YTM data is missing
    if (strategy.l2Config) {
      const bondIdx = '国债3-5年'
      const bondData = priceMap.get(bondIdx)
      if (!bondData || bondData.getMetric('2020-01-01') === null) {
        toast.warning('L2 已启用但缺少债券 YTM 数据，已回退静态权重。请运行 python3 scripts/fetch_data.py --full 下载。', { duration: 6000 })
      }
    }
    setCommittedStrategy(strategy)
  }, [strategy, priceMap])

  // Share (use committed strategy — what's actually computed)
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
          <div className="flex items-center gap-1 ml-4">
            <button
              type="button"
              onClick={() => setPage('sim')}
              className={`px-3 py-1 text-xs rounded transition-colors ${page === 'sim' ? 'bg-blue text-white' : 'text-text-secondary hover:text-text-primary'}`}
            >
              策略模拟
            </button>
            <button
              type="button"
              onClick={() => setPage('data')}
              className={`px-3 py-1 text-xs rounded transition-colors ${page === 'data' ? 'bg-blue text-white' : 'text-text-secondary hover:text-text-primary'}`}
            >
              数据审查
            </button>
          </div>
        </div>
        {page === 'sim' && (
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
        )}
      </nav>

      {/* Main */}
      {page === 'data' ? (
        <main className="h-[calc(100vh-3.5rem-2rem)] overflow-y-auto">
          <DataExplorer />
        </main>
      ) : (
        <>
        <main className="flex h-[calc(100vh-3.5rem-2rem)]">
        <ConfigPanel
          strategy={strategy}
          availableIndices={Array.from(priceMap.keys())}
          onChange={setStrategy}
          mobileOpen={mobileSidebar}
          onMobileToggle={() => setMobileSidebar(false)}
          maxDate={maxDataDate}
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
          ) : committedStrategy.segments.length === 0 && strategy.segments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-text-muted text-sm">添加一个定投片段开始模拟</p>
            </div>
          ) : summary ? (
            <>
              {/* Pending changes banner */}
              {hasPendingChanges && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-amber-400 text-xs">配置已修改，结果未更新</span>
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleCompute}>
                    <Play size={12} /> 重新计算
                  </Button>
                </div>
              )}
              <KpiCards
                summary={summary}
                transactionCount={summary.transactions.length}
                evalEndDate={committedStrategy.evalWindow.endDate}
              />
              <ValueChart summary={summary} transactions={summary.transactions} priceMap={priceMap} evalEndDate={committedStrategy.evalWindow.endDate} l2Config={committedStrategy.l2Config} />
              <ResultTabs
                summary={summary}
                transactions={summary.transactions}
                evalEndDate={committedStrategy.evalWindow.endDate}
                priceMap={priceMap}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <Button onClick={handleCompute} size="sm" className="h-9 text-sm gap-2">
                <Play size={14} /> 开始计算
              </Button>
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
        </>
      )}
    </div>
  )
}
