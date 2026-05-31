"""Fetch historical total return index, price index, and gold data using AKShare."""
import akshare as ak
import os
import time

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(OUTPUT_DIR, exist_ok=True)

INDICES = [
    ('上证50',   '000016', 'H00016'),
    ('沪深300',  '000300', 'H00300'),
    ('中证500',  '000905', 'H00905'),
    ('中证1000', '000852', 'H00852'),
    ('中证红利', '000922', 'H00922'),
]

def write_csv(path, rows):
    with open(path, 'w') as f:
        f.write('日期,收盘价\n')
        seen = set()
        for d, v in rows:
            if d in seen: continue
            seen.add(d)
            f.write(f'{d},{v}\n')
    return len(seen)

def fetch_code(code, label):
    """Fetch one index code, retry with year batches if full range fails."""
    print(f'    {label} ({code})', end=' ', flush=True)

    # Try full range first
    try:
        df = ak.stock_zh_index_hist_csindex(symbol=code, start_date='20040101', end_date='20260531')
        if not df.empty:
            rows = [(str(r['日期'])[:10], r['收盘']) for _, r in df.iterrows()]
            n = write_csv(os.path.join(OUTPUT_DIR, f'{label}.csv'), rows)
            print(f'→ {n} rows')
            return n
    except:
        pass

    # Fallback: year by year
    print('(batch)', end=' ', flush=True)
    all_rows = []
    for y in range(2004, 2027):
        try:
            df = ak.stock_zh_index_hist_csindex(symbol=code, start_date=f'{y}0101', end_date=f'{y}1231')
            time.sleep(0.2)
            if df.empty: continue
            for _, r in df.iterrows():
                all_rows.append((str(r['日期'])[:10], r['收盘']))
        except:
            continue
    if all_rows:
        n = write_csv(os.path.join(OUTPUT_DIR, f'{label}.csv'), rows)
        print(f'→ {n} rows')
        return n
    print('→ EMPTY')
    return 0

def fetch_gold():
    print(f'    AU9999', end=' ', flush=True)
    try:
        df = ak.spot_hist_sge(symbol='Au99.99')
        rows = [(str(r['date'])[:10], r['close']) for _, r in df.iterrows()]
        n = write_csv(os.path.join(OUTPUT_DIR, 'AU9999.csv'), rows)
        print(f'→ {n} rows')
        return n
    except Exception as e:
        print(f'→ FAILED: {e}')
        return 0

def main():
    print('=== Fetching Index Data ===\n')

    for name, price_code, tr_code in INDICES:
        print(f'{name}:')
        fetch_code(price_code, f'{name}价格指数')
        fetch_code(tr_code,   f'{name}全收益')
        time.sleep(0.5)
        print()

    print('Gold:')
    fetch_gold()

    print('\n=== Files ===')
    for f in sorted(os.listdir(OUTPUT_DIR)):
        p = os.path.join(OUTPUT_DIR, f)
        lines = sum(1 for _ in open(p)) - 1
        print(f'  {f:<32s} {lines:>6,d} rows')

if __name__ == '__main__':
    main()
