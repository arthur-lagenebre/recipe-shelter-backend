# Recipe Shelter - Backend

Backend Node.js/Express de **Recipe Shelter**, un projet de formation autour d'un site de partage de recettes de cuisine.

## Stack

- Node.js
- Express
- TypeScript
- MySQL
- Multer et Sharp pour les images de couverture
- Stockage local ou S3 compatible Cloudflare R2
- JWT d’app et d’administration stockés dans des cookies HttpOnly distincts

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
- insère les données de référence minimales : rôles et permissions RBAC, catégories, ingrédients, groupes de tags, tags et ustensiles ;
- ne crée aucun compte utilisateur ou staff par défaut.

La réinitialisation crée aussi les profils spécialisés `CommunityProfiles` et
`StaffProfiles`, ainsi que leurs stockages de sessions séparés
`CommunitySessions` et `StaffSessions`. Une ligne `StaffSessions` exige une date
de vérification MFA et référence obligatoirement le credential de
`StaffWebAuthnCredentials` utilisé. Un profil staff ne peut pas devenir actif
tant qu’un passkey ou une clé de sécurité WebAuthn avec vérification utilisateur
n’a pas été enregistré. Les sessions staff conservent aussi l’adresse IP, le
user-agent et, en cas de révocation, sa cause ainsi que l’identité staff à
l’origine de l’action lorsqu’elle existe. Les causes distinguent la déconnexion,
la révocation volontaire, la désactivation ou le verrouillage du compte, le
changement de mot de passe, le reset MFA, la suspicion de compromission et le
retrait du dernier rôle.

Toute modification du hash de mot de passe révoque immédiatement les sessions
du domaine correspondant : `CommunitySessions` pour une identité community et
`StaffSessions` pour une identité staff. Les deux stockages ne sont jamais
révoqués transversalement. Côté staff, le passage à `disabled` ou `locked`, la
remise à zéro de `MfaEnrolledAt` et le retrait du dernier `StaffRoles` révoquent
également toutes les sessions actives. Chaque requête authentifiée revalide la
session persistée ; un JWT déjà émis devient donc inutilisable immédiatement.
Les challenges d’authentification et les sessions staff capturent aussi la
`SessionVersion` du profil. Chaque événement global de sécurité l’incrémente :
une cérémonie MFA commencée avant l’événement ne peut donc pas recréer une
session dans une fenêtre de concurrence.

Les opérations staff les plus sensibles exigent en plus que la vérification
forte de la session courante date de moins de 5 minutes par défaut. Le backend
contrôle directement `StaffSessions.MfaVerifiedAt` sur une session active ; une
nouvelle connexion staff complète (mot de passe puis WebAuthn) renouvelle cette
preuve. Une preuve absente ou trop ancienne retourne
`401 AUTH_RECENT_AUTHENTICATION_REQUIRED` avant toute mutation ou écriture
d’audit.

Les identités staff ne sont jamais supprimées physiquement : le schéma refuse
la suppression d’un `StaffProfiles`, la relation avec `Users` est restrictive
et les relations dépendantes vers l’identité staff n’utilisent aucune cascade
de suppression.
L’identité des acteurs d’audit et toutes les clés étrangères restent ainsi
résolubles après une désactivation.

Les comptes staff cumulent leurs rôles via `StaffRoles`. Leurs permissions
effectives proviennent exclusivement de `RolePermissions` ; un compte sans rôle
ou sans permission correspondante est refusé par défaut. Les comptes community
ne reçoivent aucun rôle RBAC.

Chaque rôle possède un `Code` stable distinct de son nom d'affichage. Le seed
initialise `RecipeModerator`, `CommentModerator`, `UserAdmin`, `CatalogManager`
et `SuperAdmin`. Les permissions de `SuperAdmin` sont associées directement :
ce rôle n'hérite pas automatiquement des rôles métier.

Les codes de permission sont stables, en minuscules et suivent la convention
`domaine.action`. Aucune permission implicite ni wildcard n'est interprétée par
le backend. Le catalogue initial est le suivant :

| Domaine | Permissions |
| --- | --- |
| Système | `system.health.read` |
| Recettes | `recipe.review`, `recipe.publish`, `recipe.reject`, `recipe.archive`, `recipes.delete` |
| Commentaires | `comment.review`, `comment.hide`, `comment.restore`, `comments.update`, `comments.delete` |
| Utilisateurs community | `user.read`, `user.ban`, `user.unban` |
| Catalogue | `catalog.read`, `catalog.manage` |
| Staff | `staff.read`, `staff.create`, `staff.disable`, `staff.enable`, `staff.role.grant`, `staff.role.revoke`, `staff.session.revoke` |
| Audit | `audit.read` |

Les décisions de rejet ou d’archivage administratif d’une recette, de
ban/unban d’un compte community, de masquage d’un commentaire et de
désactivation d’un compte staff exigent un body `{ "reason": string }`. Le
motif est normalisé puis validé entre 10 et 1000 caractères côté contrôleur et
côté service. Chaque décision ajoute une entrée au journal métier du domaine
(`RecipeModerationLogs`, `CommentModerationLogs`, `UserModerationLogs` ou
`StaffModerationLogs`) et, lorsque le domaine expose un état courant, y reporte
aussi le motif. Cette écriture est réalisée dans la même transaction que
l’entrée d’audit administrative. Chaque journal métier est une extension
append-only de cette entrée : `AdminAuditLogId` est à la fois sa clé primaire et
une clé étrangère vers `AdminAuditLogs.Id`. Le journal spécialisé ne recopie que
la cible métier typée ; l’acteur, l’action, le motif, la date et le
`correlationId` sont lus depuis l’unique entrée d’audit associée. Chaque route
utilise sa permission métier (`recipe.reject`, `recipe.archive`, `user.ban`,
`user.unban`, `comment.hide` ou `staff.disable`) ; le simple fait d’être staff
ne suffit pas.

La matrice initiale est explicite et insérée de manière idempotente par le seed :

| Rôle | Permissions |
| --- | --- |
| `RecipeModerator` | `recipe.review`, `recipe.publish`, `recipe.reject`, `recipe.archive` |
| `CommentModerator` | `comment.review`, `comment.hide`, `comment.restore`, `comments.update` |
| `UserAdmin` | `user.read`, `user.ban`, `user.unban` |
| `CatalogManager` | `catalog.read`, `catalog.manage` |
| `SuperAdmin` | Toutes les permissions listées dans le catalogue, associées explicitement |

Les suppressions définitives de recettes et commentaires, la gestion du staff,
l'audit et la santé du service restent ainsi réservés au rôle `SuperAdmin` dans
le seed initial.

Les décisions d'autorisation sont centralisées dans
`src/services/auth/authorization.service.ts`. `hasPermission` n'accorde que les
permissions explicites d'un compte staff actif. Les middlewares
`CommunityOnly`, `StaffOnly` et `RequirePermission(permission)` de
`src/middlewares/authorization.ts` appliquent ces décisions aux routes et
refusent par défaut un contexte absent, inactif ou incompatible.

La frontière administrative centrale et le routeur de santé déclarent en outre
leur catalogue de politiques avant les contrôleurs. `EnforceAuthorizationPolicies`
refuse toute combinaison méthode/chemin non déclarée avec `AUTH_POLICY_REQUIRED`,
ainsi que toute permission absente du catalogue applicatif avec
`AUTH_PERMISSION_UNKNOWN`. Ces refus produisent une trace structurée contenant
le code, la méthode, le chemin, la raison et l'identifiant du compte authentifié.

Les écritures du journal d'audit administratif passent exclusivement par
`AdminAuditService.record`. Les types d'événements et de cibles autorisés sont
centralisés dans `src/services/admin/admin-audit.events.ts` avec des codes
stables en minuscules. Le service normalise les champs d'investigation, masque
récursivement les secrets connus et génère un identifiant de corrélation absent.
La politique d'échec est `fail-closed` : l'écriture est synchrone et obligatoire,
une panne est journalisée sans les snapshots ni le détail de base, puis remontée
sous le code générique `ADMIN_AUDIT_RECORD_FAILED`. Chaque mutation sensible
effective des recettes, commentaires, utilisateurs, invitations et sessions staff crée une
seule entrée avec l'acteur, la cible, l'état avant/après, l'adresse IP, le
user-agent et le `correlationId`. La mutation métier et cette entrée utilisent
la même transaction ; un échec d'audit annule donc aussi la mutation. Les APIs
actuelles des tags, ingrédients et catégories restent en lecture seule et aucun
modèle d'alias n'est encore présent : il n'existe pas d'action applicative de ces
domaines à journaliser à ce stade.

Les lectures de la liste, d'un profil staff et de ses sessions administrées
sont également auditées. Elles n'enregistrent ni e-mail ni secret : seulement la
cible, le statut ou le nombre de résultats utile à l'investigation.

Le journal est append-only. Le repository applicatif n'expose que la création
d'une entrée ; aucune route HTTP de modification ou de suppression n'est
déclarée et `audit.read` ne donne qu'un droit de consultation. Le schéma refuse
en outre tout `UPDATE` ou `DELETE` de `AdminAuditLogs` par des triggers dédiés,
et la clé étrangère de l'acteur empêche la suppression d'un staff encore
référencé par le journal.

`GET /api/v1/admin/audit-logs` expose cette consultation avec pagination et
filtres exacts sur l'acteur, l'action, la cible, la période et le
`correlationId`. La projection conserve les snapshots expurgés nécessaires à
l'investigation, mais ne sélectionne ni adresse IP, ni user-agent, ni e-mail.
La lecture utilise un repository dédié, séparé de la frontière append-only
d'écriture.

Le schéma d'installation est consolidé dans l'unique fichier
`database/migrations/1_create_schema.sql`. Les auteurs de recettes et de
commentaires ainsi que les propriétaires de favoris référencent exclusivement
`CommunityProfiles.UserId`; les rôles staff référencent `StaffProfiles.UserId`.
Une base vierge interdit donc structurellement à un compte staff de posséder du
contenu communautaire.

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

### Commande de bootstrap SuperAdmin

La commande contrôlée reste disponible avec :

```bash
npm run build
npm run bootstrap:superadmin -- --email superadmin@example.com --username superadmin
```

La commande crée dans une transaction le premier SuperAdmin en statut `invited`
et lui envoie un lien d'activation à usage unique avant de valider cette
transaction. Un échec SMTP ne déclenche donc aucune suppression physique et
permet de relancer la commande. Aucun mot de passe ou jeton
n'est accepté en argument ou écrit dans la sortie de la commande : seul le hash
SHA-256 du jeton est conservé dans `StaffInvitations`. L'invitation expire après
30 minutes par défaut, durée configurable avec
`BOOTSTRAP_SUPER_ADMIN_INVITATION_TTL_MINUTES`, et impose l'activation du MFA.
Le jeton est consommé uniquement par la transaction qui enregistre le premier
credential WebAuthn, définit le mot de passe et active le profil staff.

Après ce bootstrap, `POST /api/v1/admin/staff/invitations` permet à un staff
actif disposant de `staff.create` d'inviter un autre compte avec `email`,
`displayName` et une liste non vide de codes de rôles dans `roles`. Le compte et
ses rôles sont créés en statut `invited`; seul le hash SHA-256 du jeton est
persisté. L'invitation expire après 24 heures par défaut, impose le MFA et crée
une entrée d'audit `staff.invitations.create`. Cette création exige aussi une
authentification forte récente. Une invitation déjà présente,
un e-mail déjà attribué et un nom d'affichage déjà utilisé produisent des
conflits distincts. En cas d'échec d'audit ou d'envoi SMTP, la transaction de
création est annulée.

La gestion du cycle de vie est exposée sous `/api/v1/admin/staff`. La liste et
le détail exigent `staff.read`. Les actions `disable`, `enable`, attribution de
rôle et retrait de rôle exigent respectivement `staff.disable`, `staff.enable`,
`staff.role.grant` et `staff.role.revoke`, ainsi qu'un body `{ "reason": string }`
de 10 à 1000 caractères. Seul un compte `active` peut être désactivé et seul un
compte `disabled` avec MFA enrôlé peut être réactivé. La désactivation est
logique, conserve son acteur, son motif et sa date dans `StaffProfiles`, et
révoque toutes les sessions actives dans la transaction auditée. Le retrait du
dernier rôle révoque lui aussi toutes les sessions actives du compte. Un staff ne
peut ni se désactiver, ni s’attribuer, ni retirer ses propres rôles : ces
tentatives retournent respectivement `STAFF_DISABLE_SELF_FORBIDDEN`,
`STAFF_ROLE_GRANT_SELF_FORBIDDEN` et `STAFF_ROLE_REVOKE_SELF_FORBIDDEN` avec le
statut `403`. Aucun endpoint de réinitialisation MFA n’est exposé dans le
back-office, y compris pour son propre compte. Aucun endpoint de suppression de
compte staff n’est exposé ; les routes `DELETE` relatives aux rôles et aux
sessions révoquent uniquement des accès sans supprimer l’identité. La
désactivation ou le retrait du rôle du dernier `SuperAdmin` actif est refusé
atomiquement avec le statut `409` et le code stable `LAST_ACTIVE_SUPER_ADMIN`.
La désactivation, qui réalise la révocation globale des sessions du compte, et
toute attribution ou tout retrait du rôle `SuperAdmin` exigent une
authentification forte récente. Les changements de rôles ordinaires conservent
leurs contrôles de permission et d’anti-auto-escalade sans cette exigence
supplémentaire.

Le schéma prépare par ailleurs un futur workflow d’approbation à deux personnes
avec `StaffPrivilegeChangeRequests`. Une demande d’attribution ou de retrait de
rôle peut y être `requested`, `approved` ou `rejected`; le demandeur, la cible et
le validateur doivent être des identités staff distinctes. Ce modèle est dormant :
aucune route ne l’utilise encore et une approbation ne modifie jamais
automatiquement `StaffRoles`. Les mutations actuelles restent immédiates et
conservent les protections transactionnelles contre l’auto-escalade et la perte
du dernier `SuperAdmin` actif.

La commande nécessite donc une configuration SMTP applicative valide. Une fois
le premier SuperAdmin créé, toute nouvelle exécution est refusée, y compris si
ce premier compte est encore invité ou s'il a ensuite été désactivé.
Lorsqu'un SuperAdmin actif existe, la commande retourne le code stable
`SUPER_ADMIN_ALREADY_EXISTS` sans créer de compte ni envoyer d'invitation.

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
- `POST /api/v1/admin/auth/login/options`
- `POST /api/v1/admin/auth/login/verify`
- `POST /api/v1/admin/auth/mfa/enrollment/options`
- `POST /api/v1/staff/invitations/:token/activate`
- `GET /api/v1/admin/auth/sessions`
- `DELETE /api/v1/admin/auth/sessions/:sessionId`
- `POST /api/v1/admin/auth/logout`
- `POST /api/v1/admin/staff/invitations`
- `GET /api/v1/admin/staff`
- `GET /api/v1/admin/staff/:staffUserId`
- `POST /api/v1/admin/staff/:staffUserId/disable`
- `POST /api/v1/admin/staff/:staffUserId/enable`
- `POST /api/v1/admin/staff/:staffUserId/roles/:roleCode`
- `DELETE /api/v1/admin/staff/:staffUserId/roles/:roleCode`
- `GET /api/v1/admin/staff/:staffUserId/sessions`
- `DELETE /api/v1/admin/staff/:staffUserId/sessions/:sessionId`
- `GET /api/v1/categories`
- `GET /api/v1/ingredients`
- `GET /api/v1/tags`
- `GET /api/v1/equipments`
- `PUT /api/v1/recipes/:recipeId/cover-image` (session community active requise, `multipart/form-data`)
- `DELETE /api/v1/recipes/:recipeId/cover-image` (session community active requise)

Toutes les écritures de recettes personnelles, propositions, commentaires et
favoris exigent une session community active. Un cookie staff n’est pas lu sur
ces routes et reçoit `401 AUTH_NO_TOKEN` avant toute validation du contenu ou
écriture en base. Symétriquement, un cookie community n’est jamais accepté par
les routes administratives.

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

`POST /api/v1/auth/login` est réservé aux comptes community et pose le cookie
HttpOnly `rs_app_session`, avec l’audience JWT `recipe-shelter-app` et une durée
de 7 jours par défaut. Les endpoints `GET /api/v1/auth/me` et
`POST /api/v1/auth/logout` ne lisent et ne révoquent que cette session.

L’enrôlement initial WebAuthn se déroule via
`POST /api/v1/admin/auth/mfa/enrollment/options`, avec le jeton d’invitation,
puis `POST /api/v1/staff/invitations/:token/activate`, avec le jeton dans le
chemin et le `flowId`, le mot de passe choisi et la réponse de création WebAuthn
dans le body. Le compte reste `invited` et l’invitation reste utilisable tant que
la réponse cryptographique avec vérification utilisateur n’est pas validée. La
transaction enregistre alors le credential et le mot de passe, consomme le jeton
une seule fois et passe le compte à `active` ; elle ne crée pas de session.

Le login staff se déroule ensuite en deux appels. Le premier,
`POST /api/v1/admin/auth/login/options`, vérifie `mail` et `password` puis
retourne `{ flowId, publicKey }` sans cookie. Le second,
`POST /api/v1/admin/auth/login/verify`, vérifie l’assertion WebAuthn et pose
alors seulement `rs_admin_session`, audience `recipe-shelter-admin`, pour 8
heures par défaut. Les challenges expirent, ne sont utilisables qu’une fois et
la vérification utilisateur (PIN ou biométrie) est obligatoire.
`GET /api/v1/admin/auth/me` et `POST /api/v1/admin/auth/logout` utilisent
exclusivement ce cookie. Copier ou renommer un cookie ne permet pas de franchir
la frontière : l’audience, le type de compte, les méthodes d’authentification et
la session persistée sont tous vérifiés côté backend.

`GET /api/v1/admin/auth/sessions` liste les sessions MFA actives du compte
staff courant. `DELETE /api/v1/admin/auth/sessions/:sessionId` permet de révoquer
l’une de ses propres sessions et supprime le cookie admin lorsqu’il s’agit de la
session courante. L’administration utilise
`GET /api/v1/admin/staff/:staffUserId/sessions` avec `staff.read` et
`DELETE /api/v1/admin/staff/:staffUserId/sessions/:sessionId` avec
`staff.session.revoke`; cette dernière exige un body `{ "reason": string }` de
10 à 1000 caractères. Les réponses exposent uniquement l’identifiant de
gestion, l’IP, le user-agent, la méthode et la date MFA, les dates de création et
d’expiration et l’indicateur de session courante ; elles ne contiennent jamais
le JWT, le cookie, le credential WebAuthn, sa clé publique ou un challenge.

Le démarrage échoue si les deux noms de cookie ou audiences sont identiques, ou
si la durée staff n’est pas strictement plus courte que la durée community.

La configuration par défaut utilise `SameSite=lax`, adaptée à un front et une API sur le même site, par exemple `recipe-shelter.fr` et `api.recipe-shelter.fr`. Si vous passez en `SameSite=none` pour un vrai contexte cross-site, ajoutez une protection CSRF côté API.

Des exemples de requêtes sont disponibles dans `tests/http/`.

Les routes `/api/v1/admin/*` et `/api/v1/health/*` demandent une session staff active possédant la permission explicite de la route. Pour une première vérification sans authentification, utilisez plutôt `GET /api/v1/recipes`, `GET /api/v1/categories`, `GET /api/v1/ingredients` ou `GET /api/v1/tags`.

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
| `AUTH_APP_JWT_AUDIENCE` | Non | Audience JWT community. Défaut : `recipe-shelter-app`. |
| `AUTH_APP_JWT_EXPIRES_IN` | Non | Durée du JWT community. Défaut : `7d`. |
| `AUTH_APP_SESSION_COOKIE_NAME` | Non | Cookie community. Défaut : `rs_app_session`. |
| `AUTH_APP_SESSION_COOKIE_MAX_AGE_MS` | Non | Durée du cookie community. Défaut : durée du JWT community. |
| `AUTH_ADMIN_JWT_AUDIENCE` | Non | Audience JWT staff. Défaut : `recipe-shelter-admin`. |
| `AUTH_ADMIN_JWT_EXPIRES_IN` | Non | Durée du JWT staff. Défaut : `8h`. |
| `AUTH_ADMIN_SESSION_COOKIE_NAME` | Non | Cookie staff. Défaut : `rs_admin_session`. |
| `AUTH_ADMIN_SESSION_COOKIE_MAX_AGE_MS` | Non | Durée du cookie staff. Défaut : durée du JWT staff. |
| `AUTH_SESSION_COOKIE_SAME_SITE` | Non | Politique SameSite du cookie : `lax`, `strict` ou `none`. Défaut : `lax`. |
| `AUTH_SESSION_COOKIE_SECURE` | Non | Force le flag `Secure`. Défaut : `true` en production, sinon `false`. |
| `AUTH_SESSION_COOKIE_DOMAIN` | Non | Domaine du cookie si nécessaire, par exemple `.recipe-shelter.fr`. Défaut : non défini. |
| `AUTH_STAFF_WEBAUTHN_ORIGIN` | Oui pour le staff | Origine frontend exacte attendue dans les réponses WebAuthn, sans chemin. Défaut : origine de `FRONTEND_BASE_URL`. |
| `AUTH_STAFF_WEBAUTHN_RP_ID` | Oui pour le staff | Domaine WebAuthn (Relying Party ID). Défaut : hostname de l’origine WebAuthn. |
| `AUTH_STAFF_WEBAUTHN_RP_NAME` | Non | Nom affiché par l’authenticator. Défaut : `Recipe Shelter Staff`. |
| `AUTH_STAFF_MFA_CHALLENGE_TTL_MS` | Non | Durée maximale d’une cérémonie WebAuthn, plafonnée à 10 minutes. Défaut : `300000` ms. |
| `AUTH_STAFF_REAUTHENTICATION_MAX_AGE_MS` | Non | Âge maximal de la preuve forte pour une opération hautement sensible, plafonné à 10 minutes. Défaut : `300000` ms. |
| `BOOTSTRAP_SUPER_ADMIN_INVITATION_TTL_MINUTES` | Non | Durée de l'invitation du premier SuperAdmin. Défaut : `30` minutes. |
| `STAFF_INVITATION_TTL_MINUTES` | Non | Durée des invitations staff créées par l'API. Défaut : `1440` minutes. |
| `BCRYPT_COST` | Non | Coût bcrypt pour le hash des mots de passe. Défaut : `12`. |
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
| `SMTP_HOST` | Selon usage | Serveur SMTP pour validation email, reset password, invitations staff et contact. |
| `SMTP_PORT` | Selon usage | Port SMTP. |
| `SMTP_SECURE` | Selon usage | `true` pour TLS direct, sinon `false`. |
| `SMTP_USER` | Selon usage | Utilisateur SMTP si nécessaire. |
| `SMTP_PASSWORD` | Selon usage | Mot de passe SMTP si nécessaire. |
| `SMTP_FROM` | Selon usage | Adresse expéditeur des emails applicatifs. |
| `CONTACT_RECIPIENT_EMAIL` | Selon usage | Adresse qui reçoit les messages du formulaire de contact. |

Les routes publiques de lecture peuvent fonctionner sans SMTP réel. Les routes `POST /api/v1/auth/register`, `POST /api/v1/auth/resend-validation-email`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/admin/staff/invitations` et `POST /api/v1/contact` ont besoin d'une configuration SMTP valide pour envoyer des emails.

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
