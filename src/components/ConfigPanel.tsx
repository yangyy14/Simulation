import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Plus, ChevronDown } from 'lucide-react'
import SegmentEditor from './SegmentEditor'
import type { Strategy, Segment } from '@/modules/strategy'
import { cn } from '@/lib/utils'

interface Props {
  strategy: Strategy
  availableIndices: string[]
  onChange: (s: Strategy) => void
  mobileOpen?: boolean
  onMobileToggle?: () => void
  maxDate?: string
}

const DEFAULT_SEGMENT: Segment = {
  indexName: '沪深300全收益',
  frequency: 'monthly',
  day: 1,
  amount: 1000,
  startDate: '2020-01-01',
  endDate: '2025-12-31',
}

export default function ConfigPanel({ strategy, availableIndices, onChange, mobileOpen, onMobileToggle, maxDate }: Props) {
  const [feeOpen, setFeeOpen] = useState(false)
  const [l2Open, setL2Open] = useState(false)

  const addSegment = () => {
    const seg = { ...DEFAULT_SEGMENT, indexName: availableIndices[0] || '沪深300全收益' }
    onChange({ ...strategy, segments: [...strategy.segments, seg] })
  }

  const updateSegment = (idx: number, seg: Segment) => {
    const segs = [...strategy.segments]
    segs[idx] = seg
    onChange({ ...strategy, segments: segs })
  }

  const removeSegment = (idx: number) => {
    onChange({ ...strategy, segments: strategy.segments.filter((_, i) => i !== idx) })
  }

  const setEval = (key: 'startDate' | 'endDate', value: string) => {
    onChange({ ...strategy, evalWindow: { ...strategy.evalWindow, [key]: value } })
  }

  const setFee = (key: 'purchaseFee' | 'redemptionFee' | 'managementFee', value: number) => {
    onChange({ ...strategy, fees: { ...strategy.fees, [key]: value } })
  }

  const setL2 = (patch: Partial<NonNullable<Strategy['l2Config']>>) => {
    const current = strategy.l2Config || { stockMinPct: 0.4, stockMaxPct: 0.8, lookbackYears: 5, deadZoneLow: 40, deadZoneHigh: 60 }
    onChange({ ...strategy, l2Config: { ...current, ...patch } })
  }

  const toggleL2 = () => {
    if (strategy.l2Config) {
      onChange({ ...strategy, l2Config: undefined })
    } else {
      onChange({ ...strategy, l2Config: { stockMinPct: 0.4, stockMaxPct: 0.8, lookbackYears: 5, deadZoneLow: 40, deadZoneHigh: 60 } })
    }
  }

  return (
    <aside className={`w-[380px] min-w-[380px] bg-surface border-r border-border overflow-y-auto p-4 flex flex-col gap-4 transition-all max-md:w-full max-md:min-w-0 ${mobileOpen === false ? 'max-md:hidden' : ''} ${mobileOpen ? 'max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full' : ''}`}>
      {/* Mobile close button */}
      <button
        className="hidden max-md:block absolute top-3 right-3 text-text-muted hover:text-text-primary p-1"
        onClick={onMobileToggle}
        aria-label="关闭配置面板"
      >
        ✕
      </button>

      {/* 计算窗口 */}
      <Card className="border-border bg-card">
        <CardHeader className="px-4 py-3">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">计算窗口</span>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">开始日期</Label>
              <Input
                type="date"
                value={strategy.evalWindow.startDate}
                onChange={(e) => setEval('startDate', e.target.value)}
                max={maxDate}
                className="h-8 text-sm bg-root border-border"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">结束日期</Label>
              <Input
                type="date"
                value={strategy.evalWindow.endDate}
                onChange={(e) => setEval('endDate', e.target.value)}
                max={maxDate}
                className="h-8 text-sm bg-root border-border"
              />
            </div>
          </div>
          <p className="text-[11px] text-text-muted italic">可超出定投区间，模拟持有观望</p>
        </CardContent>
      </Card>

      {/* 费率 */}
      <Card className="border-border bg-card">
        <CardHeader
          className="px-4 py-3 cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => setFeeOpen(!feeOpen)}
        >
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">费率（可选）</span>
          <ChevronDown size={14} className={cn('text-text-muted transition-transform', feeOpen && 'rotate-180')} />
        </CardHeader>
        {feeOpen && (
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">申购费 %</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={strategy.fees.purchaseFee * 100}
                  onChange={(e) => setFee('purchaseFee', (Number(e.target.value) || 0) / 100)}
                  placeholder="0"
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">赎回费 %</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={strategy.fees.redemptionFee * 100}
                  onChange={(e) => setFee('redemptionFee', (Number(e.target.value) || 0) / 100)}
                  placeholder="0"
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">管理费 %/年</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={strategy.fees.managementFee * 100}
                  onChange={(e) => setFee('managementFee', (Number(e.target.value) || 0) / 100)}
                  placeholder="0"
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* L2 动态权重 */}
      <Card className="border-border bg-card">
        <CardHeader
          className="px-4 py-3 cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => setL2Open(!l2Open)}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">L2 动态权重</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleL2() }}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded transition-colors',
                strategy.l2Config ? 'bg-blue text-white' : 'bg-root text-text-muted border border-border',
              )}
            >
              {strategy.l2Config ? '已启用' : '未启用'}
            </button>
          </div>
          <ChevronDown size={14} className={cn('text-text-muted transition-transform', l2Open && 'rotate-180')} />
        </CardHeader>
        {l2Open && strategy.l2Config && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">股票最低占比 %</Label>
                <Input
                  type="number" min={0} max={100} step={1}
                  value={Math.round(strategy.l2Config.stockMinPct * 100)}
                  onChange={(e) => setL2({ stockMinPct: (Number(e.target.value) || 0) / 100 })}
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">股票最高占比 %</Label>
                <Input
                  type="number" min={0} max={100} step={1}
                  value={Math.round(strategy.l2Config.stockMaxPct * 100)}
                  onChange={(e) => setL2({ stockMaxPct: (Number(e.target.value) || 0) / 100 })}
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
            </div>
            {strategy.l2Config.stockMinPct >= strategy.l2Config.stockMaxPct && (
              <p className="text-[11px] text-red">最低占比必须小于最高占比</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">死区下界 %</Label>
                <Input
                  type="number" min={0} max={100} step={1}
                  value={strategy.l2Config.deadZoneLow}
                  onChange={(e) => setL2({ deadZoneLow: (Number(e.target.value) || 0) })}
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">死区上界 %</Label>
                <Input
                  type="number" min={0} max={100} step={1}
                  value={strategy.l2Config.deadZoneHigh}
                  onChange={(e) => setL2({ deadZoneHigh: (Number(e.target.value) || 0) })}
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
            </div>
            {strategy.l2Config.deadZoneLow >= strategy.l2Config.deadZoneHigh && (
              <p className="text-[11px] text-red">死区下界必须小于上界</p>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">回溯年数</Label>
              <Input
                type="number" min={1} max={20} step={1}
                value={strategy.l2Config.lookbackYears}
                onChange={(e) => setL2({ lookbackYears: (Number(e.target.value) || 5) })}
                className="h-8 text-sm bg-root border-border font-mono w-24"
              />
            </div>
            <p className="text-[11px] text-text-muted italic">
              通过股债收益差自动偏移 A 股和债券的权重。需要债券 YTM 数据（运行 fetch_data.py --full 下载）
            </p>
          </CardContent>
        )}
      </Card>

      <Separator className="bg-border" />

      {/* 定投片段 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">定投片段</span>
          <span className="text-[11px] text-text-muted">共 {strategy.segments.length} 段</span>
        </div>

        {strategy.segments.map((seg, idx) => (
          <SegmentEditor
            key={idx}
            segment={seg}
            index={idx}
            availableIndices={availableIndices}
            onChange={(s) => updateSegment(idx, s)}
            onRemove={() => removeSegment(idx)}
            maxDate={maxDate}
          />
        ))}

        <button
          onClick={addSegment}
          className="w-full py-2.5 border border-dashed border-border rounded-lg text-text-secondary hover:text-blue hover:border-blue hover:bg-blue/5 transition-colors text-sm flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          添加片段
        </button>
      </div>
    </aside>
  )
}
