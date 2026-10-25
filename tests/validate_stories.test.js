// Vérifie que tests/validate_stories.py détecte bien chaque défaut du schéma,
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

const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

const base = () => [{
  id: 'mandela',
  name: 'Nelson Mandela',
  category: 'Politique · Afrique du Sud',
  lowest: 'Vingt-sept ans de prison.',
  comeback: 'Président en 1994.',
  wikipedia: 'Nelson Mandela',
  photo: 'photos/mandela.jpg',
  image_credit: 'Auteur, CC BY-SA 4.0',
  image_license: 'CC BY-SA 4.0',
  image_source: 'https://commons.wikimedia.org/wiki/File:Mandela.jpg',
  sources: ['https://fr.wikipedia.org/wiki/Nelson_Mandela'],
}];

function makeRepo(stories, { widgetCopy = stories, photo = true, sync } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'mur-validate-'));
  const widget = path.join(root, 'widget/mur-des-retournements.widget');
  mkdirSync(path.join(widget, 'photos'), { recursive: true });
  writeFileSync(path.join(root, 'stories.json'), JSON.stringify(stories, null, 2));
  writeFileSync(path.join(widget, 'stories.json'), JSON.stringify(widgetCopy, null, 2));
  if (photo) writeFileSync(path.join(widget, 'photos/mandela.jpg'), 'jpg');
  if (sync !== undefined) {
    mkdirSync(path.join(widget, 'lib'));
    writeFileSync(path.join(widget, 'lib/sync.js'), sync);
  }
  return root;
}

function validate(root) {
  const r = spawnSync(python, [SCRIPT, root], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const expectFail = (stories, pattern, opts) => {
  const { code, out } = validate(makeRepo(stories, opts));
  assert.equal(code, 1, `échec attendu, sortie : ${out}`);
  assert.match(out, pattern);
};

describe('validate_stories.py', { skip: python ? false : 'python3 indisponible' }, () => {
  test('données conformes acceptées', () => {
    const { code, out } = validate(makeRepo(base(), { sync: `export const DATA_URL = '${DATA_URL}';\n` }));
    assert.equal(code, 0, out);
    assert.match(out, /OK: 1 histoires/);
  });
  test('optionnels absents acceptés (wikipedia non requis)', () => {
    const { code, out } = validate(makeRepo([{ id: 'a', name: 'A B', lowest: 'x', comeback: 'y' }]));
    assert.equal(code, 0, out);
  });
  test('liste vide refusée', () => expectFail([], /vide/));
  test('champ requis manquant', () => {
    const s = base(); delete s[0].comeback;
    expectFail(s, /comeback/);
  });
  test('id invalide', () => expectFail([{ ...base()[0], id: 'Mandela_1' }], /id invalide/));
  test('id dupliqué', () => expectFail([...base(), { ...base()[0], name: 'Autre' }], /dupliqué/));
  test('texte trop long', () => expectFail([{ ...base()[0], lowest: 'a'.repeat(401) }], /trop long/));
  test('texte de 400 caractères accepté', () => {
    const { code, out } = validate(makeRepo([{ ...base()[0], comeback: 'a'.repeat(400) }]));
    assert.equal(code, 0, out);
  });
  test('optionnel de mauvais type', () => expectFail([{ ...base()[0], lesson: 12 }], /lesson/));
  test('sources pas un tableau', () => expectFail([{ ...base()[0], sources: 'https://a.org' }], /sources/));
  test('URL non https', () => expectFail([{ ...base()[0], image_url: 'http://exemple.org/a.jpg' }], /https/));
  test('source non https', () => expectFail([{ ...base()[0], sources: ['ftp://a.org/x'] }], /https/));
  test('photo introuvable', () => expectFail(base(), /photo introuvable/, { photo: false }));
  test('photo hors du dossier du widget', () => expectFail([{ ...base()[0], photo: '../secret.jpg' }], /relatif/));
  test('crédit manquant avec photo', () => {
    const s = base(); delete s[0].image_credit;
    expectFail(s, /image_credit/);
  });
  test('licence manquante avec photo', () => {
    const s = base(); delete s[0].image_license;
    expectFail(s, /image_license/);
  });
  test('tiret cadratin refusé', () => expectFail([{ ...base()[0], comeback: 'Libéré — président.' }], /cadratin/));
  test('tiret demi-cadratin refusé', () => expectFail([{ ...base()[0], category: 'Politique – Afrique' }], /demi-cadratin/));
  test('copie du widget différente', () => expectFail(base(), /copie locale/, { widgetCopy: [] }));
  test('DATA_URL incorrecte dans lib/sync.js', () => expectFail(base(), /DATA_URL/, {
    sync: "export const DATA_URL = 'https://raw.githubusercontent.com/autre/depot/main/stories.json';\n",
  }));
});
