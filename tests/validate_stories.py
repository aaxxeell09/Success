#!/usr/bin/env python3
"""Validation de stories.json selon le schéma de docs/ARCHITECTURE.md.

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

REQUIRED = ('id', 'name', 'lowest', 'comeback')
OPTIONAL_STR = ('category', 'lesson', 'wikipedia', 'photo', 'image_url',
                'image_credit', 'image_license', 'image_source')
HTTPS_FIELDS = ('image_url', 'image_source')
MAX_TEXT = 400
ID_RE = re.compile(r'^[a-z0-9-]+$')
DASHES = {'—': 'tiret cadratin', '–': 'tiret demi-cadratin'}
KNOWN = set(REQUIRED) | set(OPTIONAL_STR) | {'sources'}

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
    for key in ('lowest', 'comeback'):
        value = item.get(key)
        if isinstance(value, str) and len(value) > MAX_TEXT:
            err(f'{label} : texte trop long pour {key} ({len(value)} > {MAX_TEXT})')
    for key in OPTIONAL_STR:
        if key in item:
            value = item[key]
            if not isinstance(value, str) or not value.strip():
                err(f'{label} : champ optionnel {key} doit être une chaîne non vide')
    for key in HTTPS_FIELDS:
        if isinstance(item.get(key), str) and item[key].strip() and not is_https(item[key]):
            err(f'{label} : {key} doit être une URL https')
    if 'sources' in item:
        sources = item['sources']
        if not isinstance(sources, list) or not all(isinstance(s, str) for s in sources):
            err(f'{label} : sources doit être un tableau de chaînes')
        else:
            for s in sources:
                if not is_https(s):
                    err(f'{label} : source non https : {s}')
    photo = item.get('photo')
    if isinstance(photo, str) and photo.strip():
        rel = Path(photo)
        if rel.is_absolute() or '..' in rel.parts or photo.startswith(('http:', 'https:')):
            err(f'{label} : photo doit être un chemin relatif au dossier du widget')
        elif not (WIDGET / rel).is_file():
            err(f'{label} : photo introuvable : widget/mur-des-retournements.widget/{photo}')
        for key in ('image_credit', 'image_license'):
            if not isinstance(item.get(key), str) or not item[key].strip():
                err(f'{label} : {key} requis quand photo est renseigné')
    unknown = set(item) - KNOWN
    if unknown:
        warnings.append(f'{label} : champs non documentés : {", ".join(sorted(unknown))}')
    check_dashes(item, label)


def main():
    data = load(ROOT / 'stories.json')
    if data is not None:
        if not isinstance(data, list) or not data:
            err('La liste des histoires est vide ou n’est pas un tableau')
        else:
            ids = set()
            for index, item in enumerate(data):
                check_story(index, item, ids)
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
    print(f'OK: {len(data)} histoires vérifiées ; copie locale identique')
    return 0


if __name__ == '__main__':
    sys.exit(main())
