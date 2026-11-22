#!/usr/bin/env python3
"""Holt Biere aus Open Food Facts (ODbL) und schreibt tools/catalog_off.tsv.

Open Food Facts ist eine offene Datenbank (Open Database License): Nutzung erlaubt,
mit Namensnennung und unter derselben Lizenz für die abgeleitete Datenbank.
Shop-Datenbanken (z. B. Online-Händler) werden bewusst NICHT abgefragt – die sind geschützt.

Aufruf:  python3 tools/import_off.py   (dauert ein paar Minuten, danach tools/build_catalog.py)
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'app'))
import os, tempfile  # noqa: E402
os.environ.setdefault('DATA_DIR', tempfile.mkdtemp())
from server import beer_key  # noqa: E402  gleiche Zuordnung wie Server und App

UA = 'Bierstudio-Katalogimport/1.0 (+https://github.com/yosip9999/bierstudio)'
API = 'https://search.openfoodfacts.org/search?'
FIELDS = 'code,product_name,product_name_de,brands,categories_tags,nutriments,countries_tags'
# GS1-Länderpräfixe der Hersteller (nicht Verkaufsland): DACH, CZ, BE, NL, DK, PL
PREFIXES = {'DE': ['40', '41', '42', '43', '440'], 'AT': ['90', '91'], 'CH': ['76'], 'CZ': ['859'],
            'BE': ['54'], 'NL': ['87'], 'DK': ['57'], 'PL': ['590']}
STYLES = [('alkoholfrei', 'Alkoholfrei'), ('alcohol-free', 'Alkoholfrei'), ('non-alcoholic', 'Alkoholfrei'), (' 0,0', 'Alkoholfrei'), (' 0.0', 'Alkoholfrei'),
          ('radler', 'Radler'), ('shandy', 'Radler'), ('naturradler', 'Radler'),
          ('hefeweizen', 'Weizen'), ('weißbier', 'Weizen'), ('weissbier', 'Weizen'), ('weizen', 'Weizen'), ('wheat', 'Weizen'), ('witbier', 'Witbier'),
          ('doppelbock', 'Bock'), ('bock', 'Bock'), ('india pale', 'IPA'), ('ipa', 'IPA'), ('pale ale', 'Pale Ale'),
          ('stout', 'Stout'), ('porter', 'Porter'), ('schwarzbier', 'Schwarzbier'), ('rauchbier', 'Märzen'),
          ('kellerbier', 'Kellerbier'), ('zwickel', 'Kellerbier'), ('landbier', 'Kellerbier'), ('zoigl', 'Kellerbier'),
          ('märzen', 'Märzen'), ('marzen', 'Märzen'), ('festbier', 'Märzen'), ('kölsch', 'Kölsch'), ('kolsch', 'Kölsch'),
          ('altbier', 'Alt'), ('dunkel', 'Dunkel'), ('export', 'Export'), ('helles', 'Helles'), (' hell', 'Helles'),
          ('pils', 'Pils'), ('tripel', 'Tripel'), ('dubbel', 'Dubbel'), ('quadrupel', 'Quadrupel'), ('saison', 'Saison'),
          ('blanche', 'Witbier'), (' wit ', 'Witbier'), ('blonde', 'Blonde'), (' blond ', 'Blonde'), ('ambrée', 'Amber'), ('amber', 'Amber'),
          ('brune', 'Dubbel'), ('sans alcool', 'Alkoholfrei'), ('bezalkohol', 'Alkoholfrei'), ('alkoholfri', 'Alkoholfrei'), ('alcoholvrij', 'Alkoholfrei'),
          ('lager', 'Lager')]
# Packungsangaben und Füllwörter, die nicht in den Biernamen gehören
PACK = re.compile(r'''\b(\d+\s*[x×]\s*)?\d+([.,]\d+)?\s*(l|ltr|liter|ml|cl)\b|\b\d+\s*[x×]\s*\d+([.,]\d+)?\b|\b(kasten|kiste|träger|sixpack|six-pack|6er|4er|20er|24er|dose|dosen|flasche|flaschen|glasflasche|mehrweg|einweg|mw|ew|pfand|bügelflasche|longneck|steinie|bier|beer|biere|bière|bierre|cerveza|piwo|pivo|birra|øl|pfandfrei|belge|premium-?bier|\d+\s*pk|\d+\s*pack)\b|\(.*?\)|\d+([.,]\d+)?\s*%\s*(vol\.?|alc\.?)?''', re.I)
ABV_IN_NAME = re.compile(r'(\d+(?:[.,]\d+)?)\s*%\s*(?:vol|alc)?', re.I)
NOT_BEER = re.compile(r'glas|krug|kronkorken|geschenk|set\b|probierpaket|adventskalender|wein|cider|limonade|spirit|likör|gin\b|essig|senf|brot|chips', re.I)


def fetch(query, page):
    url = API + urllib.parse.urlencode({'q': query, 'page': page, 'page_size': 100, 'fields': FIELDS})
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            print('  Wiederholung', attempt + 1, e.__class__.__name__, file=sys.stderr)
            time.sleep(2 + attempt * 3)
    return {'hits': []}


def tidy(s):
    s = PACK.sub(' ', str(s or ''))
    s = re.sub(r'[•*_|]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip(' -–,.;:/')
    if len(s) > 3 and s.isupper():  # „RHEINBACHER PILS“ → „Rheinbacher Pils“
        s = ' '.join(w if len(w) <= 4 else w.capitalize() for w in s.split())
    elif s[:1].islower():
        s = s[0].upper() + s[1:]
    return s


def dedupe_words(s):
    """„Val Dieu blonde Blonde“ → „Val Dieu Blonde“: aufeinanderfolgende gleiche Wörter nur einmal."""
    out = []
    for w in s.split():
        f = lambda x: re.sub(r'[^a-z0-9äöüß]', '', x.casefold())
        if out and (f(out[-1]) == f(w) or (len(f(w)) >= 5 and len(f(out[-1])) >= 5 and f(out[-1])[:5] == f(w)[:5] and abs(len(f(w)) - len(f(out[-1]))) <= 1)):
            out[-1] = w if w[:1].isupper() else out[-1]
            continue
        out.append(w)
    return ' '.join(out)


def style_of(text):
    t = ' ' + text.casefold() + ' '
    return next((s for k, s in STYLES if k in t), '')


def main():
    raw = []
    for country, prefixes in PREFIXES.items():
        for pre in prefixes:
            q = f'categories_tags:"en:beers" code:{pre}*'
            first = fetch(q, 1)
            total = first.get('count') or 0
            pages = min(100, (total + 99) // 100)
            hits = list(first.get('hits', []))
            for p in range(2, pages + 1):
                time.sleep(0.4)  # freundlich bleiben
                hits += fetch(q, p).get('hits', [])
            print(f'{country} {pre}*: {len(hits)} von {total}', file=sys.stderr)
            raw += [(country, h) for h in hits]

    curated = {}
    for line in (ROOT / 'tools/catalog.tsv').read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        p = line.split('\t')
        for n in [p[0], *[a for a in p[1].split('|') if a]]:
            curated.setdefault(beer_key(n), p[0])

    entries, extra_codes = {}, {}
    for country, h in raw:
        code = str(h.get('code') or '')
        brands = h.get('brands') or []
        brand = tidy(brands[0] if isinstance(brands, list) and brands else '' if isinstance(brands, list) else str(brands).split(',')[0])
        raw_name = str(h.get('product_name_de') or h.get('product_name') or '')
        name = tidy(raw_name)
        if not code or not name or len(name) < 3 or NOT_BEER.search(name) or (not brand and len(name.split()) < 2):
            continue
        if not re.search(r'[a-zäöüß]', name, re.I):
            continue
        # Marke vorne anstellen, wenn der Name sie nicht schon enthält („Urtrunk“ → „Rother Bräu Urtrunk“)
        # Marke nur voranstellen, wenn der Name nicht schon mit ihr (oder ihrem ersten Wort) beginnt
        bw, nw = beer_key(brand).split(), beer_key(name).split()
        bc, nc = ''.join(bw), ''.join(nw)
        has_brand = not brand or (bw and (set(bw) <= set(nw) or (nw and bw[0] == nw[0]) or (len(bc) >= 4 and nc.startswith(bc[:4]))))
        full = dedupe_words(re.sub(r'\s+', ' ', name if has_brand else f'{brand} {name}'))[:90]
        if len(beer_key(full).split()) < 1:
            continue
        cats = ' '.join(h.get('categories_tags') or [])
        n = h.get('nutriments') or {}
        try:
            abv = float(n.get('alcohol_100g', n.get('alcohol')))
            abv = round(abv, 1) if 0 <= abv <= 16 else None
        except (TypeError, ValueError):
            abv = None
        m = ABV_IN_NAME.search(raw_name)
        if abv is None and m:
            v = float(m.group(1).replace(',', '.'))
            abv = v if 0 <= v <= 16 else None
        style = style_of(f' {full} ') or style_of(cats.replace('en:', ' ').replace('-', ' '))
        if style == 'Alkoholfrei' or 'non-alcoholic' in cats or 'alcohol-free' in cats:
            abv = 0.0 if abv is None or abv > 0.5 else abv
            style = style if style in ('Alkoholfrei', 'Radler') else 'Alkoholfrei'
        key = beer_key(full)
        if key in curated:
            extra_codes.setdefault(curated[key], set()).add(code)
            continue
        e = entries.get(key)
        if not e:
            entries[key] = {'name': full, 'brewery': brand, 'style': style, 'abv': abv, 'country': country, 'codes': {code}}
        else:
            e['codes'].add(code)
            if e['abv'] is None and abv is not None:
                e['abv'] = abv
            if not e['style'] and style:
                e['style'] = style

    # Nur Einträge mit genug Infos: Stil oder Alkohol muss bekannt sein
    rows = [e for e in entries.values() if e['style'] or e['abv'] is not None]
    rows.sort(key=lambda e: (e['country'] != 'DE', e['brewery'].casefold(), e['name'].casefold()))
    out = ['# Automatisch erzeugt von tools/import_off.py aus Open Food Facts (ODbL, https://world.openfoodfacts.org).',
           '# Nicht von Hand bearbeiten – Korrekturen gehören in tools/catalog.tsv (hat Vorrang).',
           '# name\taliases\tbrewery\tstyle\tabv\tcountry\twebsite\tbarcodes (|)']
    for e in rows:
        out.append('\t'.join([e['name'], '', e['brewery'], e['style'], '' if e['abv'] is None else str(e['abv']), e['country'], '', '|'.join(sorted(e['codes']))]))
    (ROOT / 'tools/catalog_off.tsv').write_text('\n'.join(out) + '\n', encoding='utf-8')
    (ROOT / 'tools/catalog_codes.json').write_text(json.dumps({k: sorted(v) for k, v in sorted(extra_codes.items())}, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'{len(raw)} Produkte geholt → {len(rows)} Biere neu, {sum(len(v) for v in extra_codes.values())} Barcodes für bestehende Katalog-Biere', file=sys.stderr)


if __name__ == '__main__':
    main()
