# Recipe Shelter - Backend

Backend Node.js/Express de **Recipe Shelter**, un projet de formation autour d'un site de partage de recettes de cuisine.

## Stack

- Node.js
- Express
- TypeScript
- MySQL
- JWT

## Prérequis

Installez les outils suivants avant de lancer le projet :

- **Node.js LTS** avec npm
- **MySQL Server 8.x**
- Le client MySQL en ligne de commande (`mysql`)

Vous pouvez vérifier l'installation avec :

```bash
node --version
npm --version
mysql --version
```

> Le script SQL utilise la collation `utf8mb4_0900_ai_ci`, disponible avec MySQL 8. Avec MariaDB ou une ancienne version de MySQL, la création de la base peut échouer.

## Installation rapide

Depuis la racine du projet :

```bash
npm install
```

Copiez ensuite le fichier d'exemple des variables d'environnement.

Sur Windows PowerShell :

```powershell
Copy-Item .env.example .env
```

Sur macOS/Linux :

```bash
cp .env.example .env
```

Ouvrez `.env`, puis adaptez au minimum :

```env
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=recipe_shelter
DB_USER=root
DB_PASSWORD=your_database_password

JWT_SECRET=your_long_random_jwt_secret
```

Pour générer une valeur locale de `JWT_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Configuration de la base de données

Vérifiez que MySQL est démarré, puis créez la base locale avec l'un des scripts suivants :

```bash
npm run db:reset
```

Ce script :

- supprime la base `recipe_shelter` si elle existe ;
- recrée le schéma ;
- insère les données de référence minimales : rôles, catégories, ingrédients, tags et ustensiles.

Pour charger aussi des recettes, commentaires et favoris de démonstration :

```bash
npm run db:reset:demo
```

Les scripts npm utilisent `mysql -u root -p`. Si vous utilisez un autre utilisateur MySQL, lancez le script SQL directement.

Sur Windows PowerShell :

```powershell
Get-Content database\reset.sql | mysql -u votre_utilisateur -p
```

Sur macOS/Linux :

```bash
mysql -u votre_utilisateur -p < database/reset.sql
```

Dans ce cas, mettez aussi `DB_USER` et `DB_PASSWORD` à jour dans `.env`.

## Lancer le serveur

En développement :

```bash
npm run dev
```

Le serveur écoute par défaut sur :

```text
http://localhost:3000
```

Si le port est déjà utilisé, modifiez `PORT` dans `.env`.

Pour lancer la version compilée :

```bash
npm run build
npm run start
```

## Vérifier que tout fonctionne

Après `npm run dev`, testez un endpoint public.

Sur Windows PowerShell :

```powershell
Invoke-RestMethod http://localhost:3000/recipes
```

Sur macOS/Linux :

```bash
curl http://localhost:3000/recipes
```

Une réponse JSON indique que le serveur et la connexion MySQL fonctionnent. Avec `npm run db:reset`, la liste peut être vide. Avec `npm run db:reset:demo`, elle contient des recettes de démonstration.

Les routes sont exposées directement depuis la racine du serveur, sans préfixe `/api`.

Exemples :

- `GET /recipes`
- `GET /recipes/recent`
- `GET /recipes/top-rated`
- `POST /auth/login`
- `POST /auth/register`
- `GET /categories`
- `GET /ingredients`
- `GET /tags`

Des exemples de requêtes sont disponibles dans `tests/http/`.

Les routes `/admin/*` et `/health/*` demandent un JWT d'administrateur. Pour une première vérification sans authentification, utilisez plutôt `GET /recipes`, `GET /categories`, `GET /ingredients` ou `GET /tags`.

## Variables d'environnement

Les valeurs par défaut sont définies dans `.env.example`.

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `NODE_ENV` | Non | Environnement d'execution, par exemple `development`. |
| `PORT` | Non | Port HTTP du serveur. Défaut : `3000`. |
| `DB_HOST` | Oui | Hôte MySQL. |
| `DB_PORT` | Oui | Port MySQL. Défaut : `3306`. |
| `DB_NAME` | Oui | Nom de la base. Les scripts SQL créent `recipe_shelter`. |
| `DB_USER` | Oui | Utilisateur MySQL. |
| `DB_PASSWORD` | Oui | Mot de passe MySQL. |
| `DB_CONNECTION_LIMIT` | Non | Nombre maximal de connexions MySQL dans le pool. |
| `JWT_SECRET` | Oui | Secret utilisé pour signer les tokens JWT. |
| `JWT_EXPIRES_IN` | Non | Durée de validité des JWT. Défaut : `7d`. |
| `BCRYPT_COST` | Non | Cout bcrypt pour le hash des mots de passe. Défaut : `12`. |
| `AUTH_DEFAULT_ROLE_NAME` | Non | Role attribue aux nouveaux comptes. Défaut : `user`. |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | Non | Nombre maximal de tentatives sur les routes auth limitées. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Non | Fenetre du rate limit en millisecondes. |
| `CORS_ALLOWED_ORIGINS` | Non | Origines frontend autorisées, séparées par des virgules. |
| `FRONTEND_BASE_URL` | Non | URL du frontend utilisée dans les liens d'email. |
| `SMTP_HOST` | Selon usage | Serveur SMTP pour validation email, reset password et contact. |
| `SMTP_PORT` | Selon usage | Port SMTP. |
| `SMTP_SECURE` | Selon usage | `true` pour TLS direct, sinon `false`. |
| `SMTP_USER` | Selon usage | Utilisateur SMTP si nécessaire. |
| `SMTP_PASSWORD` | Selon usage | Mot de passe SMTP si nécessaire. |
| `SMTP_FROM` | Selon usage | Adresse expéditeur des emails applicatifs. |
| `CONTACT_RECIPIENT_EMAIL` | Selon usage | Adresse qui reçoit les messages du formulaire de contact. |

Les routes publiques de lecture peuvent fonctionner sans SMTP réel. Les routes `POST /auth/register`, `POST /auth/resend-validation-email`, `POST /auth/forgot-password` et `POST /contact` ont besoin d'une configuration SMTP valide pour envoyer des emails.

## Scripts utiles

```bash
npm run dev
```

Lance le serveur en mode développement avec rechargement automatique.

```bash
npm run build
```

Compile TypeScript dans `dist/`.

```bash
npm run start
```

Lance la version compilée depuis `dist/server.js`.

```bash
npm run test
```

Exécute les tests Node.js du dossier `tests/`.

```bash
npm run lint
```

Vérifie le code avec ESLint.

```bash
npm run lint:fix
```

Corrige automatiquement ce qu'ESLint peut corriger.

```bash
npm run db:reset
```

Réinitialise la base locale avec les données minimales.

```bash
npm run db:reset:demo
```

Réinitialise la base locale avec les données minimales et les données de démonstration.

## Depannage

### `JWT_SECRET is required`

Le fichier `.env` n'est pas chargé ou `JWT_SECRET` est vide. Copiez `.env.example` vers `.env`, puis renseignez `JWT_SECRET`.

### `Access denied for user`

Les identifiants MySQL ne correspondent pas. Vérifiez `DB_USER`, `DB_PASSWORD`, puis testez :

```bash
mysql -u votre_utilisateur -p
```

### `ECONNREFUSED 127.0.0.1:3306`

MySQL n'est pas démarré ou n'écoute pas sur le port configuré. Démarrez MySQL ou ajustez `DB_HOST` / `DB_PORT`.

### `Unknown collation: utf8mb4_0900_ai_ci`

Votre serveur n'est probablement pas MySQL 8. Utilisez MySQL 8.x ou adaptez la collation dans `database/reset.sql` et `database/reset_demo.sql`.

### `MAIL_SEND_FAILED` ou `CONTACT_SEND_FAILED`

La configuration SMTP est absente ou invalide. Renseignez les variables `SMTP_*` et `CONTACT_RECIPIENT_EMAIL`, ou évitez les routes qui envoient des emails pendant le développement local.

### `EADDRINUSE`

Le port du serveur est déjà utilisé. Changez `PORT` dans `.env`, par exemple :

```env
PORT=3001
```
