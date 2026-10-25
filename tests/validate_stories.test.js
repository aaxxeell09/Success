// Vérifie que tests/validate_stories.py détecte bien chaque défaut du schéma
// et des contrats v2/v3 (liste blanche, at25, photo et crédit obligatoires, archive,
// textes affichés en anglais, catégorie de thatcher, limites de mots du contrat v5),
// sur des dépôts factices créés dans un dossier temporaire.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'validate_stories.py');
const DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json';
const WHITELIST = ['valdas', 'elon', 'mandela', 'chesky', 'collison', 'pope', 'jose', 'thatcher', 'jensen', 'rdj', 'disney', 'ford'];
const N = WHITELIST.length;
// Contrat v5 : nombre maximal de mots (séparés par des espaces) par champ affiché.
const MAX_WORDS = { headline: 7, lowest: 24, comeback: 24, at25: 18 };
const words = (n) => Array.from({ length: n }, (_, i) => `word${i + 1}`).join(' ');

const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

const entry = (id) => ({
  id,
  name: `Person ${id}`,
  category: id === 'thatcher' ? 'Politics · United Kingdom' : 'Field · Country',
  lowest: 'A hard trial.',
  comeback: 'A turnaround.',
  wikipedia: `Person ${id}`,
  photo: `photos/${id}.jpg`,
  image_credit: 'Auteur, CC BY-SA 4.0',
  image_license: 'CC BY-SA 4.0',
  image_source: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  sources: [`https://fr.wikipedia.org/wiki/${id}`],
});
// Les N histoires de la liste blanche, dans l'ordre.
const base = () => WHITELIST.map(entry);
// Modifie la 3e histoire (mandela).
const withM = (patch) => base().map((s) => (s.id === 'mandela' ? { ...s, ...patch } : s));
const withoutField = (field) => base().map((s) => { if (s.id !== 'mandela') return s; const c = { ...s }; delete c[field]; return c; });

function makeRepo(stories, { widgetCopy = stories, photo = true, sync, archive } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'mur-validate-'));
  const widget = path.join(root, 'widget/mur-des-retournements.widget');
  mkdirSync(path.join(widget, 'photos'), { recursive: true });
  writeFileSync(path.join(root, 'stories.json'), JSON.stringify(stories, null, 2));
  writeFileSync(path.join(widget, 'stories.json'), JSON.stringify(widgetCopy, null, 2));
  if (photo) for (const s of stories) if (s && typeof s.id === 'string') writeFileSync(path.join(widget, `photos/${s.id}.jpg`), 'jpg');
  if (sync !== undefined) {
    mkdirSync(path.join(widget, 'lib'));
    writeFileSync(path.join(widget, 'lib/sync.js'), sync);
  }
  if (archive !== undefined) {
    mkdirSync(path.join(root, 'archive'));
    writeFileSync(path.join(root, 'archive/stories-retirees.json'), typeof archive === 'string' ? archive : JSON.stringify(archive, null, 2));
  }
  return root;
}

function validate(root) {
  const r = spawnSync(python, [SCRIPT, root], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const expectOk = (stories, opts) => {
  const { code, out } = validate(makeRepo(stories, opts));
  assert.equal(code, 0, out);
  return out;
};
const expectFail = (stories, pattern, opts) => {
  const { code, out } = validate(makeRepo(stories, opts));
  assert.equal(code, 1, `échec attendu, sortie : ${out}`);
  assert.match(out, pattern);
};

describe('validate_stories.py', { skip: python ? false : 'python3 indisponible' }, () => {
  test(`données conformes acceptées (${N} histoires de la liste blanche)`, () => {
    const out = expectOk(base(), { sync: `export const DATA_URL = '${DATA_URL}';\n` });
    assert.match(out, new RegExp(`OK: ${N} histoires`));
  });
  test('optionnels absents ou présents acceptés (wikipedia, category, sources, at25, headline)', () => {
    expectOk(base().map(({ wikipedia, category, sources, image_source, ...rest }) => (rest.id === 'thatcher' ? { ...rest, category } : rest)));
    expectOk(base().map((s) => ({ ...s, headline: `Headline for ${s.id}` })));
  });

  describe('liste blanche', () => {
    test('liste vide refusée', () => expectFail([], /vide/));
    test('un id en plus refusé', () => expectFail([...base(), entry('jobs')], /non autorisé.*jobs/));
    test('un id en moins refusé', () => expectFail(base().filter((s) => s.id !== 'pope'), /manquant.*pope/));
    test('id remplacé refusé (en plus et en moins)', () => {
      const s = base().map((x) => (x.id === 'jose' ? entry('tina') : x));
      expectFail(s, /tina/);
      expectFail(s, /manquant.*jose/);
    });
    test('ordre différent refusé', () => {
      const s = base(); [s[0], s[1]] = [s[1], s[0]];
      expectFail(s, /ordre/);
    });
  });

  describe('champs', () => {
    test('champ requis manquant', () => expectFail(withoutField('comeback'), /comeback/));
    test('id invalide', () => expectFail([...base(), { ...entry('x'), id: 'Mandela_1' }], /id invalide/));
    test('id dupliqué', () => expectFail([...base(), { ...entry('mandela'), name: 'Other' }], /dupliqué/));
    test('texte trop long', () => expectFail(withM({ lowest: 'a'.repeat(401) }), /trop long/));
    test('texte de 400 caractères accepté', () => expectOk(withM({ comeback: 'a'.repeat(400) })));
    test('optionnel de mauvais type', () => expectFail(withM({ lesson: 12 }), /lesson/));
    test('sources pas un tableau', () => expectFail(withM({ sources: 'https://a.org' }), /sources/));
    test('URL non https', () => expectFail(withM({ image_url: 'http://exemple.org/a.jpg' }), /https/));
    test('source non https', () => expectFail(withM({ sources: ['ftp://a.org/x'] }), /https/));
    test('tiret cadratin refusé', () => expectFail(withM({ comeback: 'Libéré — président.' }), /cadratin/));
    test('tiret demi-cadratin refusé', () => expectFail(withM({ category: 'Politique – Afrique' }), /demi-cadratin/));
  });

  describe('photo, crédit et licence toujours exigés', () => {
    test('photo absente des données refusée', () => expectFail(withoutField('photo'), /photo requis/));
    test('photo introuvable', () => expectFail(base(), /photo introuvable/, { photo: false }));
    test('photo hors du dossier du widget', () => expectFail(withM({ photo: '../secret.jpg' }), /relatif/));
    test('crédit manquant', () => expectFail(withoutField('image_credit'), /image_credit/));
    test('licence manquante', () => expectFail(withoutField('image_license'), /image_license/));
    test('crédit vide', () => expectFail(withM({ image_credit: '  ' }), /image_credit/));
  });

  describe('at25 (optionnel)', () => {
    const AT25 = 'At 25, in 1943, he was studying law in Johannesburg and joined the African National Congress.';
    test('at25 et at25_sources valides acceptés', () => {
      expectOk(withM({ at25: AT25, at25_sources: ['https://fr.wikipedia.org/wiki/Nelson_Mandela'] }));
    });
    test('at25 de 400 caractères accepté', () => expectOk(withM({ at25: 'a'.repeat(400) })));
    test('at25 trop long refusé', () => expectFail(withM({ at25: 'a'.repeat(401) }), /trop long pour at25/));
    test('at25 vide refusé', () => expectFail(withM({ at25: '   ' }), /at25/));
    test('at25 non textuel refusé', () => expectFail(withM({ at25: 25 }), /at25/));
    test('at25 avec tiret cadratin refusé', () => expectFail(withM({ at25: 'À 25 ans — étudiant.' }), /cadratin/));
    test('at25_sources pas un tableau refusé', () => expectFail(withM({ at25: AT25, at25_sources: 'https://a.org/x' }), /at25_sources/));
    test('at25_sources non https refusé', () => expectFail(withM({ at25: AT25, at25_sources: ['http://a.org/x'] }), /at25_sources.*https/));
    test('at25_sources avec un élément non textuel refusé', () => expectFail(withM({ at25: AT25, at25_sources: [42] }), /at25_sources/));
  });

  describe('headline (optionnel)', () => {
    test('headline de 120 caractères accepté', () => expectOk(withM({ headline: 'a'.repeat(120) })));
    test('headline trop long refusé', () => expectFail(withM({ headline: 'a'.repeat(121) }), /trop long pour headline/));
    test('headline vide refusé', () => expectFail(withM({ headline: ' ' }), /headline/));
    test('headline non textuel refusé', () => expectFail(withM({ headline: 3 }), /headline/));
    test('headline avec tiret cadratin refusé', () => expectFail(withM({ headline: 'Prisonnier — président' }), /cadratin/));
  });

  describe('contrat v5 : limites de mots (aucun défilement)', () => {
    for (const [key, max] of Object.entries(MAX_WORDS)) {
      test(`${key} de ${max} mots accepté`, () => expectOk(withM({ [key]: words(max) })));
      test(`${key} de ${max + 1} mots refusé`, () => expectFail(withM({ [key]: words(max + 1) }),
        new RegExp(`mandela.*trop de mots pour ${key} \\(${max + 1} > ${max}\\)`)));
    }
    test('mots comptés sur les espaces (espaces multiples et retours à la ligne ignorés)', () => {
      expectOk(withM({ lowest: `  ${words(MAX_WORDS.lowest).split(' ').join('   ')}\n` }));
      expectFail(withM({ comeback: words(MAX_WORDS.comeback + 1).split(' ').join('\n') }), /trop de mots pour comeback/);
    });
    test('ponctuation collée au mot : un seul mot (« 1990, »)', () => {
      expectOk(withM({ headline: 'Freed in 1990, president by 1994.' }));
    });
    test('plusieurs champs trop longs : chaque erreur listée', () => {
      const { code, out } = validate(makeRepo(withM({ lowest: words(30), at25: words(19) })));
      assert.equal(code, 1, out);
      assert.match(out, /trop de mots pour lowest \(30 > 24\)/);
      assert.match(out, /trop de mots pour at25 \(19 > 18\)/);
    });
    test('name et catégorie non concernés par les limites de mots', () => {
      expectOk(withM({ name: words(12) }));
    });
  });

  describe('archive des histoires retirées', () => {
    test('archive absente : accepté', () => expectOk(base()));
    test('archive sans id commun : acceptée', () => expectOk(base(), { archive: [entry('jobs'), entry('tina')] }));
    test('archive avec un id commun : refusée', () => expectFail(base(), /archive.*mandela/, { archive: [entry('jobs'), entry('mandela')] }));
    test('archive JSON invalide : refusée', () => expectFail(base(), /JSON invalide/, { archive: '{corrompu' }));
    test('archive qui n’est pas un tableau : refusée', () => expectFail(base(), /tableau/, { archive: { id: 'jobs' } }));
  });

  describe('contrat v3 : textes affichés en anglais', () => {
    for (const key of ['lowest', 'comeback', 'at25', 'headline', 'category']) {
      test(`mot français dans ${key} refusé`, () => expectFail(withM({ [key]: 'Il passe des années en prison.' }), new RegExp(`${key} doit être en anglais.*des`)));
    }
    for (const word of ['le', 'les', 'des', 'avec', 'dans', 'pour']) {
      test(`mot entier « ${word} » refusé`, () => expectFail(withM({ comeback: `It works ${word} sure.` }), new RegExp(`mot\\(s\\) français : ${word}`)));
    }
    test('majuscules détectées (« Pour »)', () => expectFail(withM({ headline: 'Pour toujours' }), /headline doit être en anglais/));
    test('mots anglais contenant ces lettres acceptés (lessons, desks, handles, pouring)', () => {
      expectOk(withM({ lowest: 'Lessons, desks, battles, handles, despair and a pouring rain.', headline: 'Cradle to glory' }));
    });
    test('noms propres accentués acceptés (José Hernández)', () => expectOk(withM({ comeback: 'José Hernández reached space in 2009.' })));
    test('champs non affichés ignorés (name, image_credit)', () => expectOk(withM({ image_credit: 'Photo de la NASA pour Wikimedia' })));
    test('catégorie de thatcher exactement « Politics · United Kingdom »', () => {
      const s = base().map((x) => (x.id === 'thatcher' ? { ...x, category: 'Politique · Royaume-Uni' } : x));
      expectFail(s, /thatcher.*Politics · United Kingdom/);
      const t = base().map((x) => (x.id === 'thatcher' ? { ...x, category: 'Politics · UK' } : x));
      expectFail(t, /category attendue/);
      const u = base().map((x) => { if (x.id !== 'thatcher') return x; const c = { ...x }; delete c.category; return c; });
      expectFail(u, /category attendue/);
    });
  });

  test('copie du widget différente', () => expectFail(base(), /copie locale/, { widgetCopy: [] }));
  test('DATA_URL incorrecte dans lib/sync.js', () => expectFail(base(), /DATA_URL/, {
    sync: "export const DATA_URL = 'https://raw.githubusercontent.com/autre/depot/main/stories.json';\n",
  }));
});
