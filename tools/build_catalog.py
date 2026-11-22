#!/usr/bin/env python3
"""Baut app/static/catalog.json aus
   tools/catalog.tsv       – von Hand gepflegt (hat Vorrang)
   tools/catalog_codes.json – Barcodes zu Bieren aus catalog.tsv (von import_off.py)
   tools/catalog_off.tsv   – automatisch aus Open Food Facts (ODbL), siehe tools/import_off.py
"""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent


def rows(path, src):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        p = line.split('\t') + [''] * 8
        n, a, b, s, v, c, w, codes = p[:8]
        e = {'name': n, 'aliases': [x for x in a.split('|') if x], 'brewery': b, 'style': s,
             'abv': float(v) if v else None, 'country': c, 'site': w}
        if codes:
            e['codes'] = [x for x in codes.split('|') if x]
        if src:
            e['src'] = src
        out.append(e)
    return out


beers = rows(root / 'tools/catalog.tsv', '')
extra = root / 'tools/catalog_codes.json'
if extra.exists():
    codes = json.loads(extra.read_text(encoding='utf-8'))
    for e in beers:
        if e['name'] in codes:
            e['codes'] = sorted(set(e.get('codes', [])) | set(codes[e['name']]))
off = rows(root / 'tools/catalog_off.tsv', 'off')
out = {'version': 2, 'note': 'Richtwerte – können je nach Land und Jahrgang abweichen. Einträge mit src=off stammen aus Open Food Facts '
       '(Open Database License, https://world.openfoodfacts.org).', 'beers': beers + off}
(root / 'app/static/catalog.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(len(beers), 'gepflegte +', len(off), 'aus Open Food Facts =', len(beers) + len(off), 'Biere')
