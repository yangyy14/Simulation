import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { X, Plus, Trash2 } from 'lucide-react'
import type { Segment, Allocation } from '@/modules/strategy'
import { cn } from '@/lib/utils'
import { getAssetGroups, canSmartDCA } from '@/App'

interface Props {
  segment: Segment
  index: number
  availableIndices: string[]
  onChange: (s: Segment) => void
  onRemove: () => void
  maxDate?: string
}

const FREQ_MONTHLY = 'monthly'
const FREQ_WEEKLY = 'weekly'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MAX_ALLOCATIONS = 10

const DEFAULT_SMART_CONFIG = {
  lookbackYears: 10, cheapPercentile: 30, cheapMultiplier: 1.5,
  expensivePercentile: 70, expensiveMultiplier: 0.5,
}

function defaultAlloc(name: string): Allocation {
  return { indexName: name, weight: 0.5, amountMode: 'fixed' }
}

export default function SegmentEditor({ segment, index: i, availableIndices, onChange, onRemove, maxDate }: Props) {
  const set = (patch: Partial<Segment>) => onChange({ ...segment, ...patch })
  const isPortfolio = segment.allocations && segment.allocations.length > 0

  const enablePortfolio = () => {
    const first = availableIndices[0] || '沪深300全收益'
    const second = availableIndices.length > 1 ? availableIndices[1] : first
    onChange({
      ...segment,
      allocations: [defaultAlloc(first), defaultAlloc(second)],
      amountMode: undefined,
      smartConfig: undefined,
    })
  }

  const disablePortfolio = () => {
    onChange({
      ...segment,
      allocations: undefined,
      indexName: availableIndices[0] || segment.allocations![0].indexName,
    })
  }

  const updateAlloc = (idx: number, patch: Partial<Allocation>) => {
    if (!segment.allocations) return
    const allocs = [...segment.allocations]
    allocs[idx] = { ...allocs[idx], ...patch }
    onChange({ ...segment, allocations: allocs })
  }

  const removeAlloc = (idx: number) => {
    if (!segment.allocations || segment.allocations.length <= 2) return
    onChange({ ...segment, allocations: segment.allocations.filter((_, j) => j !== idx) })
  }

  const addAlloc = () => {
    if (!segment.allocations || segment.allocations.length >= MAX_ALLOCATIONS) return
    const used = new Set(segment.allocations.map((a) => a.indexName))
    const next = availableIndices.find((n) => !used.has(n)) || availableIndices[0] || '沪深300全收益'
    const count = segment.allocations.length + 1
    const eachWeight = Math.round(100 / count) / 100
    const allocs = segment.allocations.map((a) => ({ ...a, weight: eachWeight }))
    allocs.push({ indexName: next, weight: eachWeight, amountMode: 'fixed' as const })
    // Normalize last weight so sum = 1
    const sum = allocs.reduce((s, a) => s + a.weight, 0)
    allocs[allocs.length - 1].weight = +(allocs[allocs.length - 1].weight + (1 - sum)).toFixed(4)
    onChange({ ...segment, allocations: allocs })
  }

  const weightSum = segment.allocations?.reduce((s, a) => s + a.weight, 0) ?? 1
  const weightOk = weightSum >= 0.98 && weightSum <= 1.02

  return (
    <Card className="bg-root border-border">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">片段 #{i + 1}</span>
          <div className="flex gap-0.5 bg-surface rounded p-0.5 border border-border">
            <button
              type="button"
              onClick={disablePortfolio}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded transition-colors',
                !isPortfolio ? 'bg-blue text-white' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              单指数
            </button>
            <button
              type="button"
              onClick={enablePortfolio}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded transition-colors',
                isPortfolio ? 'bg-blue text-white' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              组合
            </button>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-text-muted hover:text-red hover:bg-red/10 p-1 rounded transition-colors"
          aria-label={`删除片段 #${i + 1}`}
        >
          <X size={14} />
        </button>
      </CardHeader>

      <CardContent className="px-3 pb-3 space-y-3">
        {/* ── Single Index Mode Fields ── */}
        {!isPortfolio && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">指数</Label>
              <select
                value={segment.indexName}
                onChange={(e) => set({ indexName: e.target.value })}
                className="flex w-full h-8 rounded border border-border bg-root px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
              >
                {getAssetGroups().map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.indices.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">定投模式</Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => set({ amountMode: 'fixed' })}
                  className={cn(
                    'flex-1 text-center py-1.5 text-xs rounded cursor-pointer transition-colors',
                    segment.amountMode !== 'smart' ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
                  )}
                >
                  固定金额
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canSmartDCA(segment.indexName)) return
                    set({ amountMode: 'smart', smartConfig: segment.smartConfig || DEFAULT_SMART_CONFIG })
                  }}
                  disabled={!canSmartDCA(segment.indexName)}
                  title={!canSmartDCA(segment.indexName) ? '该指数不支持智能定投' : undefined}
                  className={cn(
                    'flex-1 text-center py-1.5 text-xs rounded transition-colors',
                    segment.amountMode === 'smart' ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
                    !canSmartDCA(segment.indexName) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  智能定投
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Common Fields ── */}
        <div className="space-y-1">
          <Label className="text-xs text-text-secondary">频率</Label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => set({ frequency: FREQ_MONTHLY, day: 1 })}
              className={cn(
                'flex-1 text-center py-1.5 text-xs rounded cursor-pointer transition-colors',
                segment.frequency === FREQ_MONTHLY ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
              )}
            >
              按月
            </button>
            <button
              type="button"
              onClick={() => set({ frequency: FREQ_WEEKLY, day: 1 })}
              className={cn(
                'flex-1 text-center py-1.5 text-xs rounded cursor-pointer transition-colors',
                segment.frequency === FREQ_WEEKLY ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
              )}
            >
              按周
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">
              {segment.frequency === FREQ_MONTHLY ? '定投日（号）' : '定投日（周几）'}
            </Label>
            {segment.frequency === FREQ_MONTHLY ? (
              <select
                value={String(segment.day)}
                onChange={(e) => set({ day: Number(e.target.value) })}
                className="flex w-full h-8 rounded border border-border bg-root px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
              >
                {Array.from({ length: 28 }, (_, k) => k + 1).map((d) => (
                  <option key={d} value={String(d)}>{d} 日</option>
                ))}
              </select>
            ) : (
              <select
                value={String(segment.day)}
                onChange={(e) => set({ day: Number(e.target.value) })}
                className="flex w-full h-8 rounded border border-border bg-root px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
              >
                {WEEKDAYS.map((label, idx) => (
                  <option key={idx} value={String(idx)}>{label}</option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">
              {isPortfolio ? '每期总金额 ¥' : segment.amountMode === 'smart' ? '基准金额 ¥' : '金额 ¥'}
            </Label>
            <Input
              type="number"
              min={0}
              step={100}
              value={segment.amount}
              onChange={(e) => set({ amount: Number(e.target.value) || 0 })}
              className="h-8 text-sm bg-root border-border font-mono tabular-nums"
            />
          </div>
        </div>

        {/* ── Single Index Smart Config ── */}
        {!isPortfolio && segment.amountMode === 'smart' && segment.smartConfig && (
          <SmartConfigPanel cfg={segment.smartConfig} onChange={(sc) => set({ smartConfig: sc })} />
        )}

        {/* ── Portfolio Mode: Allocation List ── */}
        {isPortfolio && segment.allocations && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-secondary">
                组合分配 <span className={cn('font-mono', weightOk ? 'text-text-muted' : 'text-red')}>({(weightSum * 100).toFixed(0)}%)</span>
              </Label>
            </div>
            <div className="space-y-2">
              {segment.allocations.map((alloc, idx) => {
                const smart = alloc.amountMode === 'smart'
                const canSmart = canSmartDCA(alloc.indexName)
                return (
                  <div key={idx} className="bg-surface rounded p-2 border border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={alloc.indexName}
                        onChange={(e) => updateAlloc(idx, { indexName: e.target.value, amountMode: canSmartDCA(e.target.value) ? alloc.amountMode : 'fixed' })}
                        className="flex-1 h-7 rounded border border-border bg-root px-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
                      >
                        {getAssetGroups().map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.indices.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={Math.round(alloc.weight * 100)}
                          onChange={(e) => updateAlloc(idx, { weight: (Number(e.target.value) || 0) / 100 })}
                          className="h-7 w-16 text-xs bg-root border-border font-mono text-center"
                        />
                        <span className="text-xs text-text-muted">%</span>
                      </div>
                      {segment.allocations!.length > 2 && (
                        <button
                          onClick={() => removeAlloc(idx)}
                          className="text-text-muted hover:text-red shrink-0 p-0.5"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* Per-allocation amount mode */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateAlloc(idx, { amountMode: 'fixed' })}
                        className={cn(
                          'flex-1 text-center py-1.5 text-xs rounded cursor-pointer transition-colors',
                          !smart ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
                        )}
                      >
                        固定金额
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canSmart) return
                          updateAlloc(idx, { amountMode: 'smart', smartConfig: alloc.smartConfig || DEFAULT_SMART_CONFIG })
                        }}
                        disabled={!canSmart}
                        title={!canSmart ? '该指数不支持智能定投' : undefined}
                        className={cn(
                          'flex-1 text-center py-1.5 text-xs rounded transition-colors',
                          smart ? 'bg-blue text-white' : 'bg-root text-text-muted hover:text-text-secondary',
                          !canSmart ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                        )}
                      >
                        智能定投
                      </button>
                    </div>

                    {smart && alloc.smartConfig && canSmart && (
                      <SmartConfigPanel cfg={alloc.smartConfig} onChange={(sc) => updateAlloc(idx, { smartConfig: sc })} />
                    )}
                  </div>
                )
              })}
            </div>
            {segment.allocations.length < MAX_ALLOCATIONS && (
              <button
                type="button"
                onClick={addAlloc}
                className="w-full py-1.5 border border-dashed border-border rounded text-[11px] text-text-muted hover:text-blue hover:border-blue hover:bg-blue/5 transition-colors flex items-center justify-center gap-1"
              >
                <Plus size={12} />
                添加指数
              </button>
            )}
          </div>
        )}

        {/* ── Date Fields ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">开始日期</Label>
            <Input
              type="date"
              value={segment.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              max={maxDate}
              className="h-8 text-sm bg-root border-border"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">结束日期</Label>
            <Input
              type="date"
              value={segment.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              max={maxDate}
              className="h-8 text-sm bg-root border-border"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Reusable smart config panel
function SmartConfigPanel({ cfg, onChange }: { cfg: NonNullable<Segment['smartConfig']>; onChange: (c: NonNullable<Segment['smartConfig']>) => void }) {
  return (
    <div className="space-y-1.5 bg-root rounded p-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-text-muted whitespace-nowrap">回溯年数</Label>
        <Input
          type="number" min={1} max={20}
          value={cfg.lookbackYears}
          onChange={(e) => onChange({ ...cfg, lookbackYears: Number(e.target.value) || 10 })}
          className="h-7 w-16 text-xs bg-surface border-border font-mono"
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-text-muted shrink-0">PE ≤</span>
        <Input
          type="number" min={0} max={100}
          value={cfg.cheapPercentile}
          onChange={(e) => onChange({ ...cfg, cheapPercentile: Number(e.target.value) || 0 })}
          className="h-7 w-14 text-xs bg-surface border-border font-mono"
        />
        <span className="text-text-muted">% →</span>
        <Input
          type="number" min={0.1} max={5} step={0.1}
          value={cfg.cheapMultiplier}
          onChange={(e) => onChange({ ...cfg, cheapMultiplier: Number(e.target.value) || 1.5 })}
          className="h-7 w-16 text-xs bg-surface border-border font-mono"
        />
        <span className="text-text-muted">倍（便宜多买）</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-text-muted shrink-0">PE ≥</span>
        <Input
          type="number" min={0} max={100}
          value={cfg.expensivePercentile}
          onChange={(e) => onChange({ ...cfg, expensivePercentile: Number(e.target.value) || 70 })}
          className="h-7 w-14 text-xs bg-surface border-border font-mono"
        />
        <span className="text-text-muted">% →</span>
        <Input
          type="number" min={0.1} max={5} step={0.1}
          value={cfg.expensiveMultiplier}
          onChange={(e) => onChange({ ...cfg, expensiveMultiplier: Number(e.target.value) || 0.5 })}
          className="h-7 w-16 text-xs bg-surface border-border font-mono"
        />
        <span className="text-text-muted">倍（贵时少买）</span>
      </div>
    </div>
  )
}
