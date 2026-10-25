#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
REPO="aaxxeell09/Success"
URL="https://github.com/${REPO}.git"
if ! command -v git >/dev/null 2>&1; then echo 'Git est requis.'; exit 1; fi
if ! command -v gh >/dev/null 2>&1; then
  echo 'Installe GitHub CLI depuis https://cli.github.com/ puis relance.'
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then gh auth login --web; fi
LOGIN="$(gh api user --jq '.login')"
if [[ "${LOGIN,,}" != "aaxxeell09" ]]; then
  echo "Compte GitHub actif : ${LOGIN} (attendu : aaxxeell09)."
  echo 'Utilise gh auth switch pour sélectionner le bon compte.'
  exit 1
fi
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Le dépôt $REPO est introuvable. Il doit exister avant publication."
  exit 1
fi
if [[ ! -d .git ]]; then git init -b main; fi
if git remote get-url origin >/dev/null 2>&1; then
  CURRENT="$(git remote get-url origin)"
  case "$CURRENT" in
    "$URL"|"git@github.com:${REPO}.git") ;;
    *) echo "ATTENTION : origin pointe vers $CURRENT au lieu de $URL. Arrêt pour éviter de pousser ailleurs."; exit 1;;
  esac
else
  git remote add origin "$URL"
fi
if ! git config user.name >/dev/null; then git config user.name "$LOGIN"; fi
if ! git config user.email >/dev/null; then
  USER_ID="$(gh api user --jq '.id')"
  git config user.email "${USER_ID}+${LOGIN}@users.noreply.github.com"
fi
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add stories.json widget/mur-des-retournements.widget/stories.json
  git commit -m 'data: ajouter les 20 premières trajectoires'
  git add widget/mur-des-retournements.widget/mur-des-retournements.jsx preview
  git commit -m 'feat: widget Übersicht interactif et aperçu web'
  git add README.md CLAUDE.md installer.command publier-sur-github.command tests .gitignore
  git commit -m 'docs: installation Mac, synchronisation et validation'
else
  git add -A
  if ! git diff --cached --quiet; then git commit -m 'chore: synchroniser le projet'; fi
fi
# GitHub peut contenir un README initial si le dépôt a été créé autrement ;
# ne jamais forcer la branche distante.
if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  echo 'La branche main distante existe déjà. Vérifie et synchronise son historique avec Claude Code.'
  echo 'Aucun push automatique pour éviter d’écraser des commits.'
  exit 1
fi
git push -u origin main
echo "Publié sur https://github.com/$REPO"
printf '\nAppuie sur Entrée pour terminer...'; read -r _ || true
