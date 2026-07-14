# Recipe Shelter - Backend

Backend Node.js/Express de **Recipe Shelter**, un projet de formation autour d'un site de partage de recettes de cuisine.

## Stack

- Node.js
- Express
- TypeScript
- MySQL
- Multer et Sharp pour les images de couverture
- Stockage local ou S3 compatible Cloudflare R2
- JWT stocké en cookie HttpOnly

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
IMAGE_STORAGE_DRIVER=local
IMAGE_LOCAL_ROOT=./var/uploads
IMAGE_PUBLIC_BASE_URL=http://localhost:3000/media
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

Cette commande recrée aussi la table `RecipeImages`. Pour repartir d'un stockage local totalement vide, arrêtez l'API puis supprimez explicitement `var/uploads` :

```powershell
Remove-Item -LiteralPath .\var\uploads -Recurse -Force -ErrorAction SilentlyContinue
```

```bash
rm -rf -- ./var/uploads
```

Ce script :

- supprime la base `recipe_shelter` si elle existe ;
- recrée le schéma ;
- insère les données de référence minimales : rôles, catégories, ingrédients, groupes de tags, tags et ustensiles.

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
Invoke-RestMethod http://localhost:3000/api/v1/recipes
```

Sur macOS/Linux :

```bash
curl http://localhost:3000/api/v1/recipes
```

Une réponse JSON indique que le serveur et la connexion MySQL fonctionnent. Avec `npm run db:reset`, la liste peut être vide.

Les routes HTTP sont exposées avec le préfixe `/api/v1`.

Exemples :

- `GET /api/v1/recipes`
- `GET /api/v1/recipes/recent`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/register`
- `GET /api/v1/categories`
- `GET /api/v1/ingredients`
- `GET /api/v1/tags`
- `GET /api/v1/equipments`
- `PUT /api/v1/recipes/:recipeId/cover-image` (session requise, `multipart/form-data`)
- `DELETE /api/v1/recipes/:recipeId/cover-image` (session requise)

L'upload de couverture attend exactement un fichier dans le champ `image` et accepte un champ texte facultatif `altText`. Les entrées JPEG, PNG et WebP sont décodées puis normalisées en trois variantes WebP (1600, 800 et 400 pixels maximum). La taille d'entrée est limitée à 10 Mo. Les réponses de recette exposent `coverImage: null` ou l'objet suivant ; aucune clé interne de stockage n'est renvoyée :

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "largeUrl": "http://localhost:3000/media/recipes/1/550e8400-e29b-41d4-a716-446655440000/large.webp",
  "mediumUrl": "http://localhost:3000/media/recipes/1/550e8400-e29b-41d4-a716-446655440000/medium.webp",
  "thumbnailUrl": "http://localhost:3000/media/recipes/1/550e8400-e29b-41d4-a716-446655440000/thumbnail.webp",
  "width": 1600,
  "height": 1067,
  "altText": "Tarte aux pommes"
}
```

Les tags sont rattachés à un groupe. Les réponses `GET /api/v1/tags` et `GET /api/v1/tags/:id` incluent donc un objet `group` :

```json
{
  "id": 1,
  "name": "Végétarien",
  "slug": "vegetarien",
  "group": {
    "id": 1,
    "name": "Régimes alimentaires",
    "slug": "regimes-alimentaires",
    "sortOrder": 1
  }
}
```

`POST /api/v1/auth/login` pose le cookie HttpOnly `rs_session` et ne renvoie pas le JWT dans le JSON. Les routes authentifiées lisent ensuite ce cookie.

La configuration par défaut utilise `SameSite=lax`, adaptée à un front et une API sur le même site, par exemple `recipe-shelter.fr` et `api.recipe-shelter.fr`. Si vous passez en `SameSite=none` pour un vrai contexte cross-site, ajoutez une protection CSRF côté API.

Des exemples de requêtes sont disponibles dans `tests/http/`.

Les routes `/api/v1/admin/*` et `/api/v1/health/*` demandent une session administrateur. Pour une première vérification sans authentification, utilisez plutôt `GET /api/v1/recipes`, `GET /api/v1/categories`, `GET /api/v1/ingredients` ou `GET /api/v1/tags`.

## Variables d'environnement

Les valeurs par défaut sont définies dans `.env.example`.

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `NODE_ENV` | Non | Environnement d'exécution, par exemple `development`. |
| `PORT` | Non | Port HTTP du serveur. Défaut : `3000`. |
| `DB_HOST` | Oui | Hôte MySQL. |
| `DB_PORT` | Oui | Port MySQL. Défaut : `3306`. |
| `DB_NAME` | Oui | Nom de la base. Les scripts SQL créent `recipe_shelter`. |
| `DB_USER` | Oui | Utilisateur MySQL. |
| `DB_PASSWORD` | Oui | Mot de passe MySQL. |
| `DB_CONNECTION_LIMIT` | Non | Nombre maximal de connexions MySQL dans le pool. |
| `JWT_SECRET` | Oui | Secret utilisé pour signer les tokens JWT. |
| `JWT_EXPIRES_IN` | Non | Durée de validité des JWT. Défaut : `7d`. |
| `AUTH_SESSION_COOKIE_NAME` | Non | Nom du cookie de session. Défaut : `rs_session`. |
| `AUTH_SESSION_COOKIE_SAME_SITE` | Non | Politique SameSite du cookie : `lax`, `strict` ou `none`. Défaut : `lax`. |
| `AUTH_SESSION_COOKIE_SECURE` | Non | Force le flag `Secure`. Défaut : `true` en production, sinon `false`. |
| `AUTH_SESSION_COOKIE_DOMAIN` | Non | Domaine du cookie si nécessaire, par exemple `.recipe-shelter.fr`. Défaut : non défini. |
| `AUTH_SESSION_COOKIE_MAX_AGE_MS` | Non | Durée de vie du cookie en millisecondes. Défaut : dérivé de `JWT_EXPIRES_IN`. |
| `BCRYPT_COST` | Non | Coût bcrypt pour le hash des mots de passe. Défaut : `12`. |
| `AUTH_DEFAULT_ROLE_NAME` | Non | Rôle attribué aux nouveaux comptes. Défaut : `user`. |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | Non | Nombre maximal de tentatives sur les routes auth limitées. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Non | Fenêtre du rate limit en millisecondes. |
| `CORS_ALLOWED_ORIGINS` | Non | Origines frontend autorisées, séparées par des virgules. Les credentials CORS sont activés, donc `*` n'est pas accepté. |
| `FRONTEND_BASE_URL` | Non | URL du frontend utilisée dans les liens d'email. |
| `IMAGE_STORAGE_DRIVER` | Non | Stockage des images : `local` (défaut) ou `s3`. Toute autre valeur bloque le démarrage. |
| `IMAGE_LOCAL_ROOT` | En mode local | Répertoire racine résolu pour les uploads. Défaut : `./var/uploads`. |
| `IMAGE_PUBLIC_BASE_URL` | Oui en mode S3 | Base publique ajoutée aux clés, par exemple `http://localhost:3000/media` ou un domaine R2 public. |
| `IMAGE_S3_ENDPOINT` | En mode S3 | Endpoint privé S3/R2, par exemple `https://<account-id>.r2.cloudflarestorage.com`. |
| `IMAGE_S3_REGION` | En mode S3 | Région S3. Utiliser `auto` pour Cloudflare R2. |
| `IMAGE_S3_BUCKET` | En mode S3 | Bucket privé contenant les variantes d'image. |
| `IMAGE_S3_ACCESS_KEY_ID` | En mode S3 | Identifiant d'accès serveur, jamais transmis au frontend. |
| `IMAGE_S3_SECRET_ACCESS_KEY` | En mode S3 | Secret d'accès serveur, jamais transmis au frontend. |
| `SMTP_HOST` | Selon usage | Serveur SMTP pour validation email, reset password et contact. |
| `SMTP_PORT` | Selon usage | Port SMTP. |
| `SMTP_SECURE` | Selon usage | `true` pour TLS direct, sinon `false`. |
| `SMTP_USER` | Selon usage | Utilisateur SMTP si nécessaire. |
| `SMTP_PASSWORD` | Selon usage | Mot de passe SMTP si nécessaire. |
| `SMTP_FROM` | Selon usage | Adresse expéditeur des emails applicatifs. |
| `CONTACT_RECIPIENT_EMAIL` | Selon usage | Adresse qui reçoit les messages du formulaire de contact. |

Les routes publiques de lecture peuvent fonctionner sans SMTP réel. Les routes `POST /api/v1/auth/register`, `POST /api/v1/auth/resend-validation-email`, `POST /api/v1/auth/forgot-password` et `POST /api/v1/contact` ont besoin d'une configuration SMTP valide pour envoyer des emails.

### Stockage des images en production

Le mode local ne demande aucun service externe. Les fichiers sont servis uniquement sous `/media` depuis `IMAGE_LOCAL_ROOT`. Dans Docker, montez ce répertoire sur un volume persistant, par exemple `recipe-images:/app/var/uploads`, et configurez `IMAGE_LOCAL_ROOT=/app/var/uploads`; sans volume, les images disparaissent avec le conteneur.

Pour Cloudflare R2, utilisez `IMAGE_STORAGE_DRIVER=s3`, gardez le bucket non modifiable publiquement et configurez `IMAGE_PUBLIC_BASE_URL` avec le domaine public de lecture. L'endpoint et les identifiants R2 restent exclusivement côté backend. L'upload transite toujours par l'API ; aucune URL présignée n'est utilisée.

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
npm run test:typecheck
npm run test:coverage
```

Vérifie le typage strict des tests puis leur couverture minimale (80 % des lignes, 90 % des branches et 70 % des fonctions).

```bash
npm run test:integration
```

Exécute les tests d’intégration HTTP (routes, middlewares, contrôleurs et services).

```bash
npm run test:e2e
```

Exécute le parcours E2E critique : connexion, session, création et soumission d’une recette, modération, publication, favoris, commentaires et déconnexion. Ces tests lancent l’application Express sur un port éphémère et utilisent des adaptateurs en mémoire ; ils ne modifient pas la base MySQL locale et n’envoient aucun email.

```bash
npm run test:mysql
```

Exécute les tests des dépôts avec une vraie base MySQL isolée. Définissez auparavant `TEST_DB_NAME` avec un nom différent de `DB_NAME` et contenant `test`. La base dédiée est créée au début de la suite puis supprimée à la fin.

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

## Dépannage

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

Votre serveur n'est probablement pas MySQL 8. Utilisez MySQL 8.x ou adaptez la collation dans `database/reset.sql`.

### `MAIL_SEND_FAILED` ou `CONTACT_SEND_FAILED`

La configuration SMTP est absente ou invalide. Renseignez les variables `SMTP_*` et `CONTACT_RECIPIENT_EMAIL`, ou évitez les routes qui envoient des emails pendant le développement local.

### `EADDRINUSE`

Le port du serveur est déjà utilisé. Changez `PORT` dans `.env`, par exemple :

```env
PORT=3001
```
