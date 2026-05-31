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
}

const DEFAULT_SEGMENT: Segment = {
  indexName: '沪深300全收益',
  frequency: 'monthly',
  day: 1,
  amount: 1000,
  startDate: '2020-01-01',
  endDate: '2025-12-31',
}

export default function ConfigPanel({ strategy, availableIndices, onChange, mobileOpen, onMobileToggle }: Props) {
  const [feeOpen, setFeeOpen] = useState(false)

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
                className="h-8 text-sm bg-root border-border"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">结束日期</Label>
              <Input
                type="date"
                value={strategy.evalWindow.endDate}
                onChange={(e) => setEval('endDate', e.target.value)}
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
                  value={strategy.fees.purchaseFee * 100 || ''}
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
                  value={strategy.fees.redemptionFee * 100 || ''}
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
                  value={strategy.fees.managementFee * 100 || ''}
                  onChange={(e) => setFee('managementFee', (Number(e.target.value) || 0) / 100)}
                  placeholder="0"
                  className="h-8 text-sm bg-root border-border font-mono"
                />
              </div>
            </div>
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
