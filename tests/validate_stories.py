#!/usr/bin/env python3
"""Validation de stories.json selon le schéma de docs/ARCHITECTURE.md et le contrat v2.

Liste blanche stricte (WHITELIST, ordre compris), photo, crédit et licence
obligatoires, champ optionnel at25 (et at25_sources), archive des histoires
retirées sans id commun avec stories.json, champ optionnel headline (≤ 120).
Contrat v5 (aucun défilement) : nombre de mots limité (headline ≤ 7, lowest ≤ 24,
comeback ≤ 24, at25 ≤ 18).
Contrat v3 (widget en anglais) : les champs affichés ne contiennent pas de mots
français évidents, et la catégorie de thatcher vaut « Politics · United Kingdom ».

Usage : python3 tests/validate_stories.py [racine_du_depot]
Code de sortie 0 si tout est valide, 1 sinon (toutes les erreurs sont listées).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
WIDGET = ROOT / 'widget' / 'mur-des-retournements.widget'
DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json'

ARCHIVE = ROOT / 'archive' / 'stories-retirees.json'

# Liste blanche stricte : exactement ces ids, dans cet ordre.
WHITELIST = ('valdas', 'elon', 'mandela', 'chesky', 'collison', 'pope', 'jose', 'thatcher', 'jensen', 'rdj',
             'disney', 'ford')

REQUIRED = ('id', 'name', 'lowest', 'comeback')
# Toujours exigés dans les données (même s'ils ne sont plus affichés sur la carte).
REQUIRED_MEDIA = ('photo', 'image_credit', 'image_license')
OPTIONAL_STR = ('category', 'lesson', 'wikipedia', 'photo', 'image_url',
                'image_credit', 'image_license', 'image_source', 'at25', 'headline')
HTTPS_FIELDS = ('image_url', 'image_source')
MAX_TEXT = 400
MAX_HEADLINE = 120
# Contrat v5 (aucun défilement) : nombre maximal de mots (séparés par des espaces).
MAX_WORDS = {'headline': 7, 'lowest': 24, 'comeback': 24, 'at25': 18}
ID_RE = re.compile(r'^[a-z0-9-]+$')
DASHES = {'—': 'tiret cadratin', '–': 'tiret demi-cadratin'}
# Contrat v3 : textes affichés en anglais.
DISPLAYED = ('category', 'headline', 'lowest', 'comeback', 'at25')
FRENCH_WORDS = ('le', 'les', 'des', 'avec', 'dans', 'pour')
FRENCH_RE = re.compile(r"(?<![\w'’-])(" + '|'.join(FRENCH_WORDS) + r")(?![\w'’-])", re.IGNORECASE)
EXPECTED_CATEGORY = {'thatcher': 'Politics · United Kingdom'}
KNOWN = set(REQUIRED) | set(OPTIONAL_STR) | {'sources', 'at25_sources'}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def is_https(value):
    return isinstance(value, str) and re.match(r'^https://[^\s/]+\.[^\s]+$', value) is not None


def check_dashes(value, where):
    if isinstance(value, str):
        for char, label in DASHES.items():
            if char in value:
                err(f'{where} : {label} interdit (utiliser virgule, deux-points ou parenthèses)')
    elif isinstance(value, list):
        for i, v in enumerate(value):
            check_dashes(v, f'{where}[{i}]')
    elif isinstance(value, dict):
        for k, v in value.items():
            check_dashes(v, f'{where}.{k}')


def load(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        err(f'Fichier introuvable : {path.relative_to(ROOT)}')
    except json.JSONDecodeError as exc:
        err(f'JSON invalide dans {path.relative_to(ROOT)} : {exc}')
    return None


def check_story(index, item, ids):
    label = f'histoire n°{index + 1}'
    if not isinstance(item, dict):
        err(f'{label} : objet attendu, reçu {type(item).__name__}')
        return
    sid = item.get('id')
    if isinstance(sid, str) and sid:
        label = f'histoire « {sid} »'
    for key in REQUIRED:
        value = item.get(key)
        if not isinstance(value, str) or not value.strip():
            err(f'{label} : champ requis invalide ou vide : {key}')
    if isinstance(sid, str) and sid:
        if not ID_RE.match(sid):
            err(f'{label} : id invalide (attendu ^[a-z0-9-]+$)')
        if sid in ids:
            err(f'ID dupliqué : {sid}')
        ids.add(sid)
    for key in ('lowest', 'comeback', 'at25'):
        value = item.get(key)
        if isinstance(value, str) and len(value) > MAX_TEXT:
            err(f'{label} : texte trop long pour {key} ({len(value)} > {MAX_TEXT})')
    headline = item.get('headline')
    if isinstance(headline, str) and len(headline) > MAX_HEADLINE:
        err(f'{label} : texte trop long pour headline ({len(headline)} > {MAX_HEADLINE})')
    for key, limit in MAX_WORDS.items():
        value = item.get(key)
        if isinstance(value, str):
            words = len(value.split())
            if words > limit:
                err(f'{label} : trop de mots pour {key} ({words} > {limit}) : le texte ne tiendrait pas sur la carte sans défilement')
    for key in OPTIONAL_STR:
        if key in item:
            value = item[key]
            if not isinstance(value, str) or not value.strip():
                err(f'{label} : champ optionnel {key} doit être une chaîne non vide')
    for key in HTTPS_FIELDS:
        if isinstance(item.get(key), str) and item[key].strip() and not is_https(item[key]):
            err(f'{label} : {key} doit être une URL https')
    for key in ('sources', 'at25_sources'):
        if key in item:
            sources = item[key]
            if not isinstance(sources, list) or not all(isinstance(s, str) for s in sources):
                err(f'{label} : {key} doit être un tableau de chaînes')
            else:
                for s in sources:
                    if not is_https(s):
                        err(f'{label} : {key} : URL non https : {s}')
    for key in REQUIRED_MEDIA:
        value = item.get(key)
        if not isinstance(value, str) or not value.strip():
            err(f'{label} : {key} requis (photo authentique avec crédit et licence)')
    photo = item.get('photo')
    if isinstance(photo, str) and photo.strip():
        rel = Path(photo)
        if rel.is_absolute() or '..' in rel.parts or photo.startswith(('http:', 'https:')):
            err(f'{label} : photo doit être un chemin relatif au dossier du widget')
        elif not (WIDGET / rel).is_file():
            err(f'{label} : photo introuvable : widget/mur-des-retournements.widget/{photo}')
    for key in DISPLAYED:
        value = item.get(key)
        if isinstance(value, str):
            found = sorted({m.group(1).lower() for m in FRENCH_RE.finditer(value)})
            if found:
                err(f'{label} : {key} doit être en anglais (mot(s) français : {", ".join(found)})')
    if isinstance(sid, str) and sid in EXPECTED_CATEGORY and item.get('category') != EXPECTED_CATEGORY[sid]:
        err(f'{label} : category attendue « {EXPECTED_CATEGORY[sid]} », reçue « {item.get("category")} »')
    unknown = set(item) - KNOWN
    if unknown:
        warnings.append(f'{label} : champs non documentés : {", ".join(sorted(unknown))}')
    check_dashes(item, label)


def check_whitelist(data):
    ids = [item.get('id') for item in data if isinstance(item, dict)]
    extra = [i for i in ids if i not in WHITELIST]
    missing = [i for i in WHITELIST if i not in ids]
    if extra:
        err(f'liste blanche : id(s) non autorisé(s) : {", ".join(map(str, extra))}')
    if missing:
        err(f'liste blanche : id(s) manquant(s) : {", ".join(missing)}')
    if not extra and not missing and tuple(ids) != WHITELIST:
        err(f'liste blanche : ordre attendu {", ".join(WHITELIST)}, reçu {", ".join(ids)}')


def check_archive(data):
    if not ARCHIVE.exists():
        return
    archived = load(ARCHIVE)
    if archived is None:
        return
    if not isinstance(archived, list):
        err('archive/stories-retirees.json doit être un tableau')
        return
    current = {item.get('id') for item in data if isinstance(item, dict)}
    archived_ids = {item.get('id') for item in archived if isinstance(item, dict)}
    common = sorted(i for i in current & archived_ids if isinstance(i, str))
    if common:
        err(f'archive/stories-retirees.json : id(s) aussi présent(s) dans stories.json : {", ".join(common)}')
    check_dashes(archived, 'archive')


def main():
    data = load(ROOT / 'stories.json')
    if data is not None:
        if not isinstance(data, list) or not data:
            err('La liste des histoires est vide ou n’est pas un tableau')
        else:
            ids = set()
            for index, item in enumerate(data):
                check_story(index, item, ids)
            check_whitelist(data)
            check_archive(data)
        local = load(WIDGET / 'stories.json')
        if local is not None and local != data:
            err('La copie locale du widget ne correspond pas à la source')

    sync = WIDGET / 'lib' / 'sync.js'
    if sync.is_file():
        text = sync.read_text(encoding='utf-8')
        pattern = r"export\s+const\s+DATA_URL\s*=\s*(['\"`])" + re.escape(DATA_URL) + r"\1"
        if not re.search(pattern, text):
            err(f'lib/sync.js : DATA_URL doit valoir exactement {DATA_URL}')

    for w in warnings:
        print(f'Avertissement : {w}')
    if errors:
        for e in errors:
            print(f'ERREUR : {e}', file=sys.stderr)
        print(f'ÉCHEC : {len(errors)} erreur(s)', file=sys.stderr)
        return 1
    print(f'OK: {len(data)} histoires vérifiées (liste blanche respectée) ; copie locale identique')
    return 0


if __name__ == '__main__':
    sys.exit(main())
