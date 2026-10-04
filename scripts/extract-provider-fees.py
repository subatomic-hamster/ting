"""Reproduce the reviewed county provider-charge extraction; never infer insurance fees.

Requires pdfplumber. Download the metadata URL, then pass its saved PDF and --output.
The reviewed SHA256 is required. A changed source needs a new manual fiscal-year and
code/description review before the application dataset can be replaced.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pdfplumber

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
metadata = json.loads((repo / 'src/data/provider-fees.json').read_text())
actual_hash = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
if actual_hash != metadata['sha256']:
    raise SystemExit('Source changed. Review its year, geography, units and code/description pairs before importing.')
quarantine = {row['cdt']: row['reason'] for row in metadata['quarantined']}
rows = {}
with pdfplumber.open(args.pdf) as pdf:
    for page_index in range(7, 11):
        for table in pdf.pages[page_index].extract_tables():
            for cells in table:
                code = (cells[0] or '').strip()
                if cells[1] is None and cells[-1] is None and code.startswith('D'):
                    # Three reviewed repair rows are merged across all PDF columns.
                    for line in code.splitlines():
                        merged = re.fullmatch(r'(D\d{4})\s+(.+?)\s+(\$[\d,]+\.\d{2})', line)
                        if not merged or merged[1] in rows:
                            raise SystemExit('Ambiguous merged row; manual review required.')
                        rows[merged[1]] = {'cdt': merged[1], 'charge': float(merged[3][1:].replace(',', '')),
                                           'page': page_index + 1, 'sourceDescription': merged[2]}
                    continue
                if not re.fullmatch(r'D\d{4}', code):
                    continue
                amount = (cells[-1] or '').strip()
                if not re.fullmatch(r'\$[\d,]+\.\d{2}', amount) or code in rows:
                    raise SystemExit(f'Ambiguous/missing fee for {code}; manual review required.')
                rows[code] = {'cdt': code, 'charge': float(amount[1:].replace(',', '')),
                              'page': page_index + 1,
                              'sourceDescription': ' '.join((cells[1] or '').split())}
expected = {row['cdt'] for row in metadata['entries'] + metadata['quarantined']}
if set(rows) != expected:
    raise SystemExit(f'Extraction mismatch: missing {expected-set(rows)}, unexpected {set(rows)-expected}')
for old in metadata['entries'] + metadata['quarantined']:
    if old['charge'] != rows[old['cdt']]['charge']:
        raise SystemExit(f'Fee mismatch for {old["cdt"]}; manual review required.')
metadata['entries'] = [rows[c] for c in sorted(rows) if c not in quarantine]
metadata['quarantined'] = [{**rows[c], 'reason': quarantine[c]} for c in sorted(quarantine)]
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(metadata, indent=2) + '\n')
print(f'{len(metadata["entries"])} charges; {len(metadata["quarantined"])} quarantined; SHA256 verified. Wrote {args.output}')
