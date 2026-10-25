#!/usr/bin/env python3
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'stories.json').read_text(encoding='utf-8'))
assert isinstance(data,list) and data, 'La liste des histoires est vide'
ids=set()
for item in data:
    assert isinstance(item,dict), 'Objet attendu'
    for key in ('id','name','lowest','comeback','wikipedia'):
        assert isinstance(item.get(key),str) and item[key].strip(), f"Champ invalide {key}: {item!r}"
    assert item['id'] not in ids, f"ID dupliqué: {item['id']}"
    ids.add(item['id'])
    assert len(item['lowest']) <= 500 and len(item['comeback']) <= 500, f"Texte trop long: {item['id']}"
local=json.loads((root/'widget/mur-des-retournements.widget/stories.json').read_text(encoding='utf-8'))
assert local == data, 'La copie locale du widget ne correspond pas à la source'
print(f'OK: {len(data)} histoires vérifiées ; copie locale identique')
