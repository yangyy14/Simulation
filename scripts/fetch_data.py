#!/usr/bin/env python3
"""Fetch historical total return index, price index, and gold data.

Usage:
    python3 fetch_data.py              # Incremental (recent 30 days + today, skip full if files exist)
    python3 fetch_data.py --full       # Full re-download of all data
    python3 fetch_data.py --verify     # Only verify existing data integrity
"""
import akshare as ak
import os
import sys
import time
import argparse
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'public', 'data')
os.makedirs(OUTPUT_DIR, exist_ok=True)

INDICES = [
    ('上证50',   '000016', 'H00016'),
    ('沪深300',  '000300', 'H00300'),
    ('中证500',  '000905', 'H00905'),
    ('中证1000', '000852', 'H00852'),
    ('中证红利', '000922', 'H00922'),
]

BATCH_SLEEP = 0.3   # seconds between API calls
RETRY_SLEEP = 3.0    # seconds between retries
MAX_RETRIES = 3

# ── helpers ──────────────────────────────────────────────

def log(msg, end='\n'):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] {msg}', end=end, flush=True)

def write_csv(path, rows, has_pe=False):
    """Write sorted, deduped CSV. Returns row count (excluding header)."""
    seen = {}
    for row in rows:
        d = row[0]
        if d not in seen:
            seen[d] = row
    sorted_dates = sorted(seen.keys())
    with open(path, 'w', encoding='utf-8') as f:
        if has_pe:
            f.write('日期,收盘价,市盈率\n')
            for d in sorted_dates:
                f.write(f'{d},{seen[d][1]},{seen[d][2]}\n')
        else:
            f.write('日期,收盘价\n')
            for d in sorted_dates:
                f.write(f'{d},{seen[d][1]}\n')
    return len(sorted_dates)

def read_csv(path):
    """Read existing CSV, return list of (date_str, value)."""
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding='utf-8') as f:
        header = f.readline()
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(',')
            if len(parts) >= 2:
                try:
                    rows.append((parts[0].strip(), float(parts[1])))
                except ValueError:
                    continue
    return rows

def validate_data(path, label):
    """Check data file integrity. Returns (ok, message)."""
    if not os.path.exists(path):
        return False, f'{label}: 文件不存在'
    rows = read_csv(path)
    if len(rows) < 100:
        return False, f'{label}: 仅 {len(rows)} 行，可能不完整'
    # Check date format and sorted
    for d, v in rows:
        if len(d) != 10 or d[4] != '-' or d[7] != '-':
            return False, f'{label}: 日期格式异常 {d}'
        if v <= 0:
            return False, f'{label}: 价格异常 {v}'
    # Check date range (gold starts 2016-12 from SGE, shorter than indices)
    first, last = rows[0][0], rows[-1][0]
    if 'AU9999' not in label and first > '2005-01-01':
        return False, f'{label}: 起始日期 {first} 晚于 2005'
    if last < datetime.now().strftime('%Y-%m-%d'):
        # Not necessarily an error — data may lag by a day
        pass
    return True, f'{label}: {len(rows)} 行, {first} → {last} ✓'

# ── fetchers ─────────────────────────────────────────────

def fetch_csindex_full(code, label):
    """Download full history for one CSI index code."""
    log(f'  {label} ({code})', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.stock_zh_index_hist_csindex(
                symbol=code,
                start_date='20040101',
                end_date=datetime.now().strftime('%Y%m%d'),
            )
            if not df.empty:
                has_pe = '滚动市盈率' in df.columns
                rows = []
                for _, r in df.iterrows():
                    if has_pe:
                        rows.append((str(r['日期'])[:10], r['收盘'], r['滚动市盈率']))
                    else:
                        rows.append((str(r['日期'])[:10], r['收盘']))
                path = os.path.join(OUTPUT_DIR, f'{label}.csv')
                n = write_csv(path, rows, has_pe=has_pe)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
            else:
                log(f'→ FAILED: {e}')
                return False, 0

    # Fallback: fetch year by year
    log('→ batch mode', end=' ')
    all_rows = []
    any_pe = False
    current_year = datetime.now().year
    for y in range(2004, current_year + 1):
        try:
            df = ak.stock_zh_index_hist_csindex(
                symbol=code,
                start_date=f'{y}0101',
                end_date=f'{y}1231',
            )
            time.sleep(BATCH_SLEEP)
            if df.empty:
                continue
            has_pe = '滚动市盈率' in df.columns
            if has_pe: any_pe = True
            for _, r in df.iterrows():
                if has_pe:
                    all_rows.append((str(r['日期'])[:10], r['收盘'], r['滚动市盈率']))
                else:
                    all_rows.append((str(r['日期'])[:10], r['收盘']))
        except Exception:
            continue
    if all_rows:
        path = os.path.join(OUTPUT_DIR, f'{label}.csv')
        n = write_csv(path, all_rows, has_pe=any_pe)
        log(f'→ {n} rows (batch)')
        return True, n
    log('→ EMPTY')
    return False, 0

def fetch_gold_full():
    """Download full gold price history from SGE."""
    log('  AU9999', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.spot_hist_sge(symbol='Au99.99')
            if not df.empty:
                rows = [(str(r['date'])[:10], r['close']) for _, r in df.iterrows()]
                path = os.path.join(OUTPUT_DIR, 'AU9999.csv')
                n = write_csv(path, rows)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
    log('→ FAILED')
    return False, 0

# ── commands ─────────────────────────────────────────────

def cmd_full():
    """Download all data fresh."""
    log('=== Full Download ===\n')
    ok, fail = 0, 0

    for name, price_code, tr_code in INDICES:
        log(f'{name}:')
        s1, _ = fetch_csindex_full(price_code, f'{name}价格指数')
        s2, _ = fetch_csindex_full(tr_code,   f'{name}全收益')
        ok += 1 if s1 else 0
        fail += 0 if s1 else 1
        ok += 1 if s2 else 0
        fail += 0 if s2 else 1
        time.sleep(0.5)

    log('Gold:')
    s = fetch_gold_full()
    ok += 1 if s else 0
    fail += 0 if s else 1

    print_summary()
    return fail == 0

def cmd_verify():
    """Validate existing data files."""
    log('=== Verify Data Integrity ===\n')
    all_ok = True
    for name, _, _ in INDICES:
        for suffix in ['价格指数', '全收益']:
            path = os.path.join(OUTPUT_DIR, f'{name}{suffix}.csv')
            ok, msg = validate_data(path, f'{name}{suffix}')
            status = '✓' if ok else '✗'
            log(f'  {status} {msg}')
            if not ok:
                all_ok = False
    gold_path = os.path.join(OUTPUT_DIR, 'AU9999.csv')
    ok, msg = validate_data(gold_path, 'AU9999')
    status = '✓' if ok else '✗'
    log(f'  {status} {msg}')
    return all_ok

def cmd_default():
    """Incremental: only re-download if files are missing, then verify."""
    # Check if data exists
    missing = []
    for name, _, _ in INDICES:
        for suffix in ['价格指数', '全收益']:
            path = os.path.join(OUTPUT_DIR, f'{name}{suffix}.csv')
            if not os.path.exists(path):
                missing.append(f'{name}{suffix}')
    gold_path = os.path.join(OUTPUT_DIR, 'AU9999.csv')
    if not os.path.exists(gold_path):
        missing.append('AU9999')

    if missing:
        log(f'=== Missing {len(missing)} files, running full download ===\n')
        log('Missing: ' + ', '.join(missing) + '\n')
        return cmd_full()
    else:
        log('=== All data files present, verifying ===\n')
        return cmd_verify()

def print_summary():
    """Print data file summary."""
    log('\n=== Data Files ===')
    total = 0
    for f in sorted(os.listdir(OUTPUT_DIR)):
        if not f.endswith('.csv'):
            continue
        path = os.path.join(OUTPUT_DIR, f)
        # Use read_csv for accuracy
        rows = read_csv(path)
        size_kb = os.path.getsize(path) / 1024
        first = rows[0][0] if rows else '?'
        last = rows[-1][0] if rows else '?'
        log(f'  {f:<32s} {len(rows):>6,d} rows  {size_kb:>6.0f} KB  {first} → {last}')
        total += len(rows)
    log(f'  {"TOTAL":<32s} {total:>6,d} rows')

# ── main ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Fetch CSI index and gold data')
    parser.add_argument('--full', action='store_true', help='Full re-download')
    parser.add_argument('--verify', action='store_true', help='Only verify existing data')
    args = parser.parse_args()

    try:
        if args.verify:
            ok = cmd_verify()
        elif args.full:
            ok = cmd_full()
        else:
            ok = cmd_default()
    except KeyboardInterrupt:
        log('\nAborted.')
        sys.exit(130)
    except Exception as e:
        log(f'\nFATAL: {e}')
        sys.exit(1)

    if not ok:
        log('\nSome tasks failed. Run with --full to retry.')
        sys.exit(1)

    log('\nDone.')

if __name__ == '__main__':
    main()
