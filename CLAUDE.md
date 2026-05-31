# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

React 18 + TypeScript + Vite, shadcn/ui, ECharts (echarts-for-react), TanStack Table, Lucide React. Pure frontend, no backend.

```bash
npm run dev      # Vite dev server
npm run build    # production build
npm run test     # vitest
npx vitest path/to/file.test.ts  # single test
```

## Domain Language

Root `CONTEXT.md` is the glossary — read it before writing any code. `docs/adr/` records architectural decisions. The domain is in Chinese; use the canonical terms from CONTEXT.md in identifiers and comments.

## Architecture

Four deep modules (testable in isolation, no UI dependencies):

| Module | Responsibility |
|--------|---------------|
| **XIRR Calculator** | Pure function: `(cashflows: {date, amount}[]) => number`. Newton's method, convergence 1e-6. |
| **Data Loader** | Parses CSV from `public/data/` into `PriceSeries`. Provides `getPrice(date)` with roll-forward for non-trading days. |
| **Strategy Engine** | Validates Strategy, generates buy transactions via cashflow generation, calculates portfolio summary (market value, cost, shares). Depends on `PriceSeries` interface only. |
| **URL Serializer** | Bidirectional Strategy ↔ URL string. Round-trip stable. |

Four shallow modules (React components, no isolated testing):

| Module | Responsibility |
|--------|---------------|
| **Storage** | localStorage auto-save, JSON export/import, file drag-and-drop |
| **UI: ConfigPanel** | Segment editor cards, fee inputs, eval window dates |
| **UI: ResultsView** | KPI cards, ECharts value vs cost chart, transaction detail table |
| **App Shell** | Responsive layout (380px sidebar + flex content on desktop, stacked on mobile ≤768px), lifts all strategy state |

State lives in App level, passed down as props. Strategy is the single source of truth — all derived values (cashflows, summary, XIRR) computed on the fly.

## Design System

Dark financial dashboard theme. Colors: bg `#020617`, surface `#0F172A`, card `#1E293B`, text `#F8FAFC`, green `#22C55E` (profit), red `#EF4444` (loss), blue `#3B82F6` (chart/accent), gold `#F59E0B` (highlights). Fonts: IBM Plex Sans (UI), Fira Code (numbers/mono). Icons: Lucide React only, no emojis. `preview.html` has the reference mockup.

## Data Files

CSV files in `public/data/`, one per index: `沪深300全收益.csv`, `上证50全收益.csv`, `中证500全收益.csv`, `中证1000全收益.csv`, `中证红利全收益.csv`, `AU9999.csv`. Format: `日期,收盘价` (ISO 8601 dates, all trading days ~5500 rows each).

## Issue Tracker

Issues and PRDs live as local Markdown files under `.scratch/<feature-slug>/`. PRD template at `.scratch/<feature-slug>/PRD.md`. Status labels in Chinese: `待评估`, `待补充信息`, `可自动处理`, `需人工处理`, `不修复`. Current PRD: `.scratch/dca-simulator/PRD.md`.
