import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import type { Segment, Frequency } from '@/modules/strategy'
import { cn } from '@/lib/utils'

interface Props {
  segment: Segment
  index: number
  availableIndices: string[]
  onChange: (s: Segment) => void
  onRemove: () => void
}

const FREQ_MONTHLY = 'monthly'
const FREQ_WEEKLY = 'weekly'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function SegmentEditor({ segment, index: i, availableIndices, onChange, onRemove }: Props) {
  const set = (patch: Partial<Segment>) => onChange({ ...segment, ...patch })

  return (
    <Card className="bg-root border-border">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">片段 #{i + 1}</span>
        <button
          onClick={onRemove}
          className="text-text-muted hover:text-red hover:bg-red/10 p-1 rounded transition-colors"
          aria-label={`删除片段 #${i + 1}`}
        >
          <X size={14} />
        </button>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-text-secondary">指数</Label>
          <select
            value={segment.indexName}
            onChange={(e) => set({ indexName: e.target.value })}
            className="flex w-full h-8 rounded border border-border bg-root px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
          >
            {availableIndices.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

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
            <Label className="text-xs text-text-secondary">金额 ¥</Label>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">开始日期</Label>
            <Input
              type="date"
              value={segment.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className="h-8 text-sm bg-root border-border"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">结束日期</Label>
            <Input
              type="date"
              value={segment.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className="h-8 text-sm bg-root border-border"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
