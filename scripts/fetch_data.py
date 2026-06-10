#!/usr/bin/env python3
"""Fetch historical total return index, price index, gold data, bond indices, and US ETF NAVs.

Usage:
    python3 fetch_data.py              # Incremental (skip full if files exist, then verify)
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

BOND_INDICES = [
    ('国债1-3年', '国债总指数', '1-3年'),
    ('国债3-5年', '国债总指数', '3-5年'),
    ('国债5-7年', '国债总指数', '5-7年'),
]

US_ETF_LIST = [
    ('标普500',   '513500'),   # 博时标普500ETF
    ('纳斯达克100', '513100'),  # 国泰纳斯达克100ETF
]

HK_INDEX_LIST = [
    ('恒生科技', 'HSTECH'),
]

STAR_INDEX_LIST = [
    ('科创50', 'sh000688'),
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

def write_csv_ytm(path, rows):
    """Write 3-column bond CSV with YTM. rows = [(date, price, ytm), ...]."""
    seen = {}
    for row in rows:
        d = row[0]
        if d not in seen:
            seen[d] = row
    sorted_dates = sorted(seen.keys())
    with open(path, 'w', encoding='utf-8') as f:
        f.write('日期,收盘价,到期收益率\n')
        for d in sorted_dates:
            ytm = seen[d][2]
            ytm_str = f'{ytm}' if ytm != '' else ''
            f.write(f'{d},{seen[d][1]},{ytm_str}\n')
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

def validate_data(path, label, min_rows=100, min_start_date=None):
    """Check data file integrity. Returns (ok, message)."""
    if not os.path.exists(path):
        return False, f'{label}: 文件不存在'
    rows = read_csv(path)
    if len(rows) < min_rows:
        return False, f'{label}: 仅 {len(rows)} 行，可能不完整'
    for d, v in rows:
        if len(d) != 10 or d[4] != '-' or d[7] != '-':
            return False, f'{label}: 日期格式异常 {d}'
        if v <= 0:
            return False, f'{label}: 价格异常 {v}'
    first, last = rows[0][0], rows[-1][0]
    if min_start_date and first > min_start_date:
        return False, f'{label}: 起始日期 {first} 晚于 {min_start_date}'
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
    """Download full gold price history from SHFE gold futures (AU0 continuous contract).

    Uses SHFE gold futures as a proxy for gold spot price. The median difference
    between futures and Au99.99 spot is ~0.38% (1.6 CNY/g), negligible for DCA simulation.
    Futures data starts from 2008-01-09 vs spot from 2016-12-19, adding ~8 years.
    """
    log('  AU9999', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.futures_main_sina(symbol='AU0')
            if not df.empty:
                rows = [(str(r['日期'])[:10], r['收盘价']) for _, r in df.iterrows()]
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

def fetch_bond_cbond(name, index_category, period):
    """Download one ChinaBond treasury wealth index by duration + YTM."""
    log(f'  {name} ({index_category} / {period})', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df_price = ak.bond_index_general_cbond(
                index_category=index_category,
                indicator='财富',
                period=period,
            )
            df_ytm = ak.bond_index_general_cbond(
                index_category=index_category,
                indicator='平均市值法到期收益率',
                period=period,
            )
            if not df_price.empty:
                # Build YTM lookup by date
                ytm_map = {}
                for _, r in df_ytm.iterrows():
                    d = r['date']
                    if hasattr(d, 'strftime'):
                        d = d.strftime('%Y-%m-%d')
                    else:
                        d = str(d)[:10]
                    ytm_map[d] = r['value']
                # Merge price + YTM
                rows = []
                for _, r in df_price.iterrows():
                    d = r['date']
                    if hasattr(d, 'strftime'):
                        d = d.strftime('%Y-%m-%d')
                    else:
                        d = str(d)[:10]
                    ytm = ytm_map.get(d)
                    rows.append((d, r['value'], ytm if ytm is not None else ''))
                path = os.path.join(OUTPUT_DIR, f'{name}.csv')
                n = write_csv_ytm(path, rows)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
            else:
                log(f'→ FAILED: {e}')
                return False, 0
    log('→ FAILED')
    return False, 0

def fetch_us_etf_nav(name, symbol):
    """Download US ETF adjusted NAV history from Eastmoney."""
    log(f'  {name} ({symbol})', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.fund_etf_hist_em(
                symbol=symbol,
                period='daily',
                start_date='20000101',
                end_date=datetime.now().strftime('%Y%m%d'),
                adjust='hfq',  # 后复权 = total return
            )
            if not df.empty:
                rows = []
                for _, r in df.iterrows():
                    d = str(r['日期'])[:10]
                    price = r['收盘']
                    if price and price > 0:
                        rows.append((d, price))
                path = os.path.join(OUTPUT_DIR, f'{name}.csv')
                n = write_csv(path, rows)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
            else:
                log(f'→ FAILED: {e}')
                return False, 0
    log('→ FAILED')
    return False, 0

def fetch_hk_index_sina(symbol, label):
    """Download HK index daily data from Sina source."""
    log(f'  {label} ({symbol})', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.stock_hk_index_daily_sina(symbol=symbol)
            if not df.empty:
                rows = [(str(r['date'])[:10], r['close']) for _, r in df.iterrows()]
                path = os.path.join(OUTPUT_DIR, f'{label}.csv')
                n = write_csv(path, rows)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
            else:
                log(f'→ FAILED: {e}')
                return False, 0
    log('→ FAILED')
    return False, 0

def fetch_star_index_em(symbol, label):
    """Download STAR/other A-share index from Eastmoney daily API (no PE)."""
    log(f'  {label} ({symbol})', end=' ')
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = ak.stock_zh_index_daily(symbol=symbol)
            if not df.empty:
                rows = [(str(r['date'])[:10], r['close']) for _, r in df.iterrows()]
                path = os.path.join(OUTPUT_DIR, f'{label}.csv')
                n = write_csv(path, rows)
                log(f'→ {n} rows')
                return True, n
        except Exception as e:
            if attempt < MAX_RETRIES:
                log(f'(retry {attempt}/{MAX_RETRIES}: {e})', end=' ')
                time.sleep(RETRY_SLEEP)
            else:
                log(f'→ FAILED: {e}')
                return False, 0
    log('→ FAILED')
    return False, 0

# ── commands ─────────────────────────────────────────────

def cmd_full():
    """Download all data fresh."""
    log('=== Full Download ===\n')
    ok, fail = 0, 0

    # CSI indices
    log('--- CSI 指数 ---')
    for name, price_code, tr_code in INDICES:
        log(f'{name}:')
        s1, _ = fetch_csindex_full(price_code, f'{name}价格指数')
        s2, _ = fetch_csindex_full(tr_code,   f'{name}全收益')
        ok += 1 if s1 else 0
        fail += 0 if s1 else 1
        ok += 1 if s2 else 0
        fail += 0 if s2 else 1
        time.sleep(0.5)

    # Gold
    log('\n--- 黄金 ---')
    s = fetch_gold_full()
    ok += 1 if s else 0
    fail += 0 if s else 1
    time.sleep(0.5)

    # Bond indices (ChinaBond)
    log('\n--- 中债-国债总财富指数 ---')
    for name, index_category, period in BOND_INDICES:
        s = fetch_bond_cbond(name, index_category, period)
        ok += 1 if s else 0
        fail += 0 if s else 1
        time.sleep(0.5)

    # US ETFs
    log('\n--- 美股 ETF 净值 ---')
    for name, symbol in US_ETF_LIST:
        s = fetch_us_etf_nav(name, symbol)
        ok += 1 if s else 0
        fail += 0 if s else 1
        time.sleep(0.5)

    # HK indices
    log('\n--- 港股指数 ---')
    for name, symbol in HK_INDEX_LIST:
        s = fetch_hk_index_sina(symbol, name)
        ok += 1 if s else 0
        fail += 0 if s else 1
        time.sleep(0.5)

    # STAR indices
    log('\n--- 科创板指数 ---')
    for name, symbol in STAR_INDEX_LIST:
        s = fetch_star_index_em(symbol, name)
        ok += 1 if s else 0
        fail += 0 if s else 1
        time.sleep(0.5)

    print_summary()
    return fail == 0

def cmd_verify():
    """Validate existing data files."""
    log('=== Verify Data Integrity ===\n')
    all_ok = True

    # CSI indices
    for name, _, _ in INDICES:
        for suffix in ['价格指数', '全收益']:
            path = os.path.join(OUTPUT_DIR, f'{name}{suffix}.csv')
            ok, msg = validate_data(path, f'{name}{suffix}', min_start_date='2005-01-01')
            status = '✓' if ok else '✗'
            log(f'  {status} {msg}')
            if not ok:
                all_ok = False

    # Gold
    gold_path = os.path.join(OUTPUT_DIR, 'AU9999.csv')
    ok, msg = validate_data(gold_path, 'AU9999')
    status = '✓' if ok else '✗'
    log(f'  {status} {msg}')
    if not ok:
        all_ok = False

    # Bond indices (no min_start_date — data may start later)
    for name, _, _ in BOND_INDICES:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        ok, msg = validate_data(path, name)
        status = '✓' if ok else '✗'
        log(f'  {status} {msg}')
        if not ok:
            all_ok = False

    # US ETFs
    for name, _ in US_ETF_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        ok, msg = validate_data(path, name, min_rows=50)
        status = '✓' if ok else '✗'
        log(f'  {status} {msg}')
        if not ok:
            all_ok = False

    # HK indices
    for name, _ in HK_INDEX_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        ok, msg = validate_data(path, name, min_rows=100)
        status = '✓' if ok else '✗'
        log(f'  {status} {msg}')
        if not ok:
            all_ok = False

    # STAR indices
    for name, _ in STAR_INDEX_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        ok, msg = validate_data(path, name, min_rows=100)
        status = '✓' if ok else '✗'
        log(f'  {status} {msg}')
        if not ok:
            all_ok = False

    return all_ok

def cmd_default():
    """Incremental: only re-download if files are missing, then verify."""
    missing = []

    for name, _, _ in INDICES:
        for suffix in ['价格指数', '全收益']:
            path = os.path.join(OUTPUT_DIR, f'{name}{suffix}.csv')
            if not os.path.exists(path):
                missing.append(f'{name}{suffix}')

    gold_path = os.path.join(OUTPUT_DIR, 'AU9999.csv')
    if not os.path.exists(gold_path):
        missing.append('AU9999')

    for name, _, _ in BOND_INDICES:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        if not os.path.exists(path):
            missing.append(name)

    for name, _ in US_ETF_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        if not os.path.exists(path):
            missing.append(name)

    for name, _ in HK_INDEX_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        if not os.path.exists(path):
            missing.append(name)

    for name, _ in STAR_INDEX_LIST:
        path = os.path.join(OUTPUT_DIR, f'{name}.csv')
        if not os.path.exists(path):
            missing.append(name)

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
        rows = read_csv(path)
        size_kb = os.path.getsize(path) / 1024
        first = rows[0][0] if rows else '?'
        last = rows[-1][0] if rows else '?'
        log(f'  {f:<32s} {len(rows):>6,d} rows  {size_kb:>6.0f} KB  {first} → {last}')
        total += len(rows)
    log(f'  {"TOTAL":<32s} {total:>6,d} rows')

# ── main ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Fetch CSI index, gold, bond, and US ETF data')
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
