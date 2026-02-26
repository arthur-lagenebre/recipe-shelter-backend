# Recipe Shelter — Git Conventions & Backend Documentation

Ce document définit :

- La convention de nommage GitHub (frontend + backend)
- Les conventions de branches et commits

---

## Organisation des repositories

### Repositories principaux

- `recipe-shelter` → Application Angular
- `recipe-shelter-backend` → API Node.js

---

## Convention de branches

### Branches principales

- `main` → branche stable
- `develop` → branche d’intégration (optionnel)

### Branches de travail

Format :

- `feature/<scope>-<short-name>`
- `fix/<scope>-<short-name>`
- `chore/<short-name>`

Exemples :

- `feature/auth-register`
- `feature/recipes-search`
- `fix/login-redirect`
- `chore/eslint-config`

---

## Convention de commits (Conventional Commits)

Format :

- `type(scope): message`

### Types conseillés

- `feat` → nouvelle fonctionnalité
- `fix` → correction de bug
- `docs` → documentation
- `refactor` → refactorisation sans changement fonctionnel
- `test` → ajout/modification de tests
- `chore` → configuration, dépendances, CI…

Exemples :

- `feat(auth): add register endpoint`
- `fix(recipes): handle empty tags query`
- `docs(readme): add setup instructions`
- `chore(ci): add github workflow`

---

## Versioning

Versioning sémantique (SemVer) :

- `v0.1.0`
- `v0.2.0`
- `v1.0.0`

Rappels :

- **MAJOR** → changement incompatible
- **MINOR** → nouvelle fonctionnalité
- **PATCH** → correction de bug
