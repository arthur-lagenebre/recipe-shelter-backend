USE recipe_shelter;

SET NAMES utf8mb4;

START TRANSACTION;

-- =====================================================
-- Roles
-- =====================================================
INSERT INTO Roles (Id, Code, Name, Description) VALUES
(1, 'RecipeModerator',  'Modérateur de recettes',           'Examine, approuve, rejette et archive les recettes'),
(2, 'CommentModerator', 'Modérateur de commentaires',       'Examine, masque, restaure et modifie les commentaires'),
(3, 'UserAdmin',        'Administrateur des utilisateurs',  'Consulte, suspend et réactive les comptes utilisateurs'),
(4, 'CatalogManager',   'Gestionnaire du catalogue',        'Gère les catégories, ingrédients, tags et ustensiles'),
(5, 'SuperAdmin',       'Super administrateur',             'Dispose explicitement de toutes les permissions administratives')
AS new_roles
ON DUPLICATE KEY UPDATE
  Code = new_roles.Code,
  Name = new_roles.Name,
  Description = new_roles.Description;

-- =====================================================
-- Permissions
-- =====================================================
INSERT INTO Permissions (Id, Code, Description) VALUES
(1,  'system.health.read', "Consulter l'état de santé du service"),
(2,  'user.read', "Consulter les comptes community et leur historique de modération"),
(3,  'user.ban', "Bannir des comptes community"),
(4,  'user.unban', "Réactiver des comptes community bannis"),
(5,  'recipe.review', "Consulter les recettes à modérer"),
(6,  'recipe.publish', "Publier les recettes en attente"),
(7,  'recipe.reject', "Rejeter les recettes en attente"),
(8,  'recipe.archive', "Archiver les recettes publiées ou rejetées"),
(9,  'recipes.delete', "Supprimer définitivement des recettes"),
(10, 'comment.review', "Consulter les commentaires à modérer"),
(11, 'comment.hide', "Masquer les commentaires visibles"),
(12, 'comment.restore', "Restaurer les commentaires masqués ou supprimés par leur auteur"),
(13, 'comments.update', "Modifier des commentaires dans l'administration"),
(14, 'comments.delete', "Supprimer définitivement des commentaires"),
(15, 'catalog.read', "Consulter le catalogue dans l'administration"),
(16, 'catalog.manage', "Créer, modifier et supprimer des catégories, ingrédients et ustensiles"),
(17, 'staff.read', "Consulter les comptes staff et leurs rôles"),
(18, 'staff.create', "Inviter un compte staff avec ses rôles initiaux"),
(19, 'staff.disable', "Désactiver un compte staff et révoquer ses accès"),
(20, 'staff.enable', "Réactiver un compte staff désactivé"),
(21, 'staff.role.grant', "Attribuer un rôle à un compte staff"),
(22, 'staff.role.revoke', "Retirer un rôle à un compte staff"),
(23, 'staff.session.revoke', "Révoquer les sessions actives des comptes staff"),
(24, 'audit.read', "Consulter le journal d'audit administratif"),
(25, 'tag.read', "Consulter le catalogue complet des tags dans l'administration"),
(26, 'tag.create', "Créer un tag canonique"),
(27, 'tag.update', "Modifier un tag canonique actif"),
(28, 'tag.deprecate', "Déprécier ou restaurer un tag"),
(29, 'tag.merge', "Fusionner un tag dans un tag canonique actif"),
(30, 'ingredient.read', "Consulter le catalogue complet des ingrédients et leurs alias dans l'administration"),
(31, 'ingredient.create', "Créer un ingrédient canonique"),
(32, 'ingredient.update', "Modifier un ingrédient canonique actif"),
(33, 'ingredient.deprecate', "Déprécier ou restaurer un ingrédient"),
(34, 'ingredient.merge', "Fusionner un ingrédient dans un ingrédient canonique actif"),
(35, 'ingredient.alias.manage', "Créer, modifier et supprimer les alias d'ingrédients")
AS new_permissions
ON DUPLICATE KEY UPDATE
  Code = new_permissions.Code,
  Description = new_permissions.Description;

-- =====================================================
-- Role permissions
-- =====================================================
INSERT INTO RolePermissions (RoleId, PermissionId)
SELECT roles.Id, permissions.Id
FROM (
  -- RecipeModerator: consultation et cycle de modération, sans suppression définitive.
  SELECT 'RecipeModerator' AS RoleCode, 'recipe.review' AS PermissionCode
  UNION ALL SELECT 'RecipeModerator', 'recipe.publish'
  UNION ALL SELECT 'RecipeModerator', 'recipe.reject'
  UNION ALL SELECT 'RecipeModerator', 'recipe.archive'
  -- CommentModerator: consultation et modération réversible, sans suppression définitive.
  UNION ALL SELECT 'CommentModerator', 'comment.review'
  UNION ALL SELECT 'CommentModerator', 'comment.hide'
  UNION ALL SELECT 'CommentModerator', 'comment.restore'
  UNION ALL SELECT 'CommentModerator', 'comments.update'
  -- UserAdmin: consultation et modération des seuls comptes community.
  UNION ALL SELECT 'UserAdmin', 'user.read'
  UNION ALL SELECT 'UserAdmin', 'user.ban'
  UNION ALL SELECT 'UserAdmin', 'user.unban'
  -- CatalogManager: gestion complète des données du catalogue.
  UNION ALL SELECT 'CatalogManager', 'catalog.read'
  UNION ALL SELECT 'CatalogManager', 'catalog.manage'
  UNION ALL SELECT 'CatalogManager', 'tag.read'
  UNION ALL SELECT 'CatalogManager', 'tag.create'
  UNION ALL SELECT 'CatalogManager', 'tag.update'
  UNION ALL SELECT 'CatalogManager', 'tag.deprecate'
  UNION ALL SELECT 'CatalogManager', 'tag.merge'
  UNION ALL SELECT 'CatalogManager', 'ingredient.read'
  UNION ALL SELECT 'CatalogManager', 'ingredient.create'
  UNION ALL SELECT 'CatalogManager', 'ingredient.update'
  UNION ALL SELECT 'CatalogManager', 'ingredient.deprecate'
  UNION ALL SELECT 'CatalogManager', 'ingredient.merge'
  UNION ALL SELECT 'CatalogManager', 'ingredient.alias.manage'
  -- SuperAdmin: catalogue explicite complet, sans wildcard ni héritage de rôle.
  UNION ALL SELECT 'SuperAdmin', 'system.health.read'
  UNION ALL SELECT 'SuperAdmin', 'user.read'
  UNION ALL SELECT 'SuperAdmin', 'user.ban'
  UNION ALL SELECT 'SuperAdmin', 'user.unban'
  UNION ALL SELECT 'SuperAdmin', 'recipe.review'
  UNION ALL SELECT 'SuperAdmin', 'recipe.publish'
  UNION ALL SELECT 'SuperAdmin', 'recipe.reject'
  UNION ALL SELECT 'SuperAdmin', 'recipe.archive'
  UNION ALL SELECT 'SuperAdmin', 'recipes.delete'
  UNION ALL SELECT 'SuperAdmin', 'comment.review'
  UNION ALL SELECT 'SuperAdmin', 'comment.hide'
  UNION ALL SELECT 'SuperAdmin', 'comment.restore'
  UNION ALL SELECT 'SuperAdmin', 'comments.update'
  UNION ALL SELECT 'SuperAdmin', 'comments.delete'
  UNION ALL SELECT 'SuperAdmin', 'catalog.read'
  UNION ALL SELECT 'SuperAdmin', 'catalog.manage'
  UNION ALL SELECT 'SuperAdmin', 'staff.read'
  UNION ALL SELECT 'SuperAdmin', 'staff.create'
  UNION ALL SELECT 'SuperAdmin', 'staff.disable'
  UNION ALL SELECT 'SuperAdmin', 'staff.enable'
  UNION ALL SELECT 'SuperAdmin', 'staff.role.grant'
  UNION ALL SELECT 'SuperAdmin', 'staff.role.revoke'
  UNION ALL SELECT 'SuperAdmin', 'staff.session.revoke'
  UNION ALL SELECT 'SuperAdmin', 'audit.read'
  UNION ALL SELECT 'SuperAdmin', 'tag.read'
  UNION ALL SELECT 'SuperAdmin', 'tag.create'
  UNION ALL SELECT 'SuperAdmin', 'tag.update'
  UNION ALL SELECT 'SuperAdmin', 'tag.deprecate'
  UNION ALL SELECT 'SuperAdmin', 'tag.merge'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.read'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.create'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.update'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.deprecate'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.merge'
  UNION ALL SELECT 'SuperAdmin', 'ingredient.alias.manage'
) AS role_permission_matrix
INNER JOIN Roles AS roles ON roles.Code = role_permission_matrix.RoleCode
INNER JOIN Permissions AS permissions ON permissions.Code = role_permission_matrix.PermissionCode
ON DUPLICATE KEY UPDATE PermissionId = permissions.Id;

-- =====================================================
-- Recipe Categories
-- =====================================================
INSERT INTO RecipeCategories (Name, Slug, IconName) VALUES
('Apéritif',        'aperitif',        'snack'),
('Boissons',        'boissons',        'glass'),
('Dessert',         'dessert',         'cake'),
('Entrée',          'entree',          'salad'),
('Petit-déjeuner',  'petit-dejeuner',  'croissant'),
('Plat principal',  'plat-principal',  'dish')
AS new_cats
ON DUPLICATE KEY UPDATE
  Name     = new_cats.Name,
  IconName = new_cats.IconName;

-- =====================================================
-- Ingrédients
-- =====================================================
INSERT INTO Ingredients (Name, NormalizedName, Slug) VALUES
('Abondance', 'abondance', 'abondance'),
('Abricot', 'abricot', 'abricot'),
('Agar-agar', 'agar agar', 'agar-agar'),
('Agneau', 'agneau', 'agneau'),
('Ail', 'ail', 'ail'),
('Ail des ours', 'ail des ours', 'ail-des-ours'),
('Airelle', 'airelle', 'airelle'),
('Algue', 'algue', 'algue'),
('Aloe vera', 'aloe vera', 'aloe-vera'),
('Amande', 'amande', 'amande'),
('Amarante', 'amarante', 'amarante'),
('Ananas', 'ananas', 'ananas'),
('Anchois', 'anchois', 'anchois'),
('Andouillette', 'andouillette', 'andouillette'),
('Aneth', 'aneth', 'aneth'),
('Anguille', 'anguille', 'anguille'),
('Angélique', 'angelique', 'angelique'),
('Anis', 'anis', 'anis'),
('Araignée de mer', 'araignee de mer', 'araignee-de-mer'),
('Arnica', 'arnica', 'arnica'),
('Artichaut', 'artichaut', 'artichaut'),
('Asperge', 'asperge', 'asperge'),
('Aubergine', 'aubergine', 'aubergine'),
('Aubépine', 'aubepine', 'aubepine'),
('Avocat', 'avocat', 'avocat'),
('Babeurre', 'babeurre', 'babeurre'),
('Bacon', 'bacon', 'bacon'),
('Badiane', 'badiane', 'badiane'),
('Baie rose', 'baie rose', 'baie-rose'),
('Banane', 'banane', 'banane'),
('Bar', 'bar', 'bar'),
('Basilic', 'basilic', 'basilic'),
('Baudroie', 'baudroie', 'baudroie'),
('Bavette', 'bavette', 'bavette'),
('Betterave', 'betterave', 'betterave'),
('Beurre', 'beurre', 'beurre'),
('Beurre demi-sel', 'beurre demi sel', 'beurre-demi-sel'),
('Beurre doux', 'beurre doux', 'beurre-doux'),
('Bicarbonate de soude', 'bicarbonate de soude', 'bicarbonate-de-soude'),
('Biscotte', 'biscotte', 'biscotte'),
('Bière', 'biere', 'biere'),
('Blanc de poulet', 'blanc de poulet', 'blanc-de-poulet'),
('Blette', 'blette', 'blette'),
('Bleu d''Auvergne', 'bleu d auvergne', 'bleu-d-auvergne'),
('Blé', 'ble', 'ble'),
('Boeuf', 'boeuf', 'boeuf'),
('Boeuf haché', 'boeuf hache', 'boeuf-hache'),
('Bolet', 'bolet', 'bolet'),
('Bouillon de légumes', 'bouillon de legumes', 'bouillon-de-legumes'),
('Bouillon de poulet', 'bouillon de poulet', 'bouillon-de-poulet'),
('Boulgour', 'boulgour', 'boulgour'),
('Bourrache', 'bourrache', 'bourrache'),
('Brocoli', 'brocoli', 'brocoli'),
('Brousse', 'brousse', 'brousse'),
('Brugnon', 'brugnon', 'brugnon'),
('Cacahuète', 'cacahuete', 'cacahuete'),
('Cacao', 'cacao', 'cacao'),
('Café', 'cafe', 'cafe'),
('Caille', 'caille', 'caille'),
('Calamar', 'calamar', 'calamar'),
('Camembert', 'camembert', 'camembert'),
('Canard', 'canard', 'canard'),
('Cannelle', 'cannelle', 'cannelle'),
('Cantal', 'cantal', 'cantal'),
('Capre', 'capre', 'capre'),
('Caramel', 'caramel', 'caramel'),
('Cardamome', 'cardamome', 'cardamome'),
('Carotte', 'carotte', 'carotte'),
('Cassis', 'cassis', 'cassis'),
('Cerfeuil', 'cerfeuil', 'cerfeuil'),
('Cerise', 'cerise', 'cerise'),
('Champignon', 'champignon', 'champignon'),
('Cheddar', 'cheddar', 'cheddar'),
('Chicorée', 'chicoree', 'chicoree'),
('Chili', 'chili', 'chili'),
('Chocolat', 'chocolat', 'chocolat'),
('Chocolat au lait', 'chocolat au lait', 'chocolat-au-lait'),
('Chocolat blanc', 'chocolat blanc', 'chocolat-blanc'),
('Chocolat noir', 'chocolat noir', 'chocolat-noir'),
('Chorizo', 'chorizo', 'chorizo'),
('Chou', 'chou', 'chou'),
('Chou blanc', 'chou blanc', 'chou-blanc'),
('Chou kale', 'chou kale', 'chou-kale'),
('Chou-fleur', 'chou fleur', 'chou-fleur'),
('Châtaigne', 'chataigne', 'chataigne'),
('Chèvre', 'chevre', 'chevre'),
('Ciboulette', 'ciboulette', 'ciboulette'),
('Cidre', 'cidre', 'cidre'),
('Citron', 'citron', 'citron'),
('Citron vert', 'citron vert', 'citron-vert'),
('Clou de girofle', 'clou de girofle', 'clou-de-girofle'),
('Clémentine', 'clementine', 'clementine'),
('Coing', 'coing', 'coing'),
('Comté', 'comte', 'comte'),
('Concentré de tomate', 'concentre de tomate', 'concentre-de-tomate'),
('Concombre', 'concombre', 'concombre'),
('Coriandre', 'coriandre', 'coriandre'),
('Cornichon', 'cornichon', 'cornichon'),
('Courge', 'courge', 'courge'),
('Courgette', 'courgette', 'courgette'),
('Couscous', 'couscous', 'couscous'),
('Crabe', 'crabe', 'crabe'),
('Cresson', 'cresson', 'cresson'),
('Crevette', 'crevette', 'crevette'),
('Crème fraîche', 'creme fraiche', 'creme-fraiche'),
('Crème liquide', 'creme liquide', 'creme-liquide'),
('Crème épaisse', 'creme epaisse', 'creme-epaisse'),
('Cumin', 'cumin', 'cumin'),
('Curcuma', 'curcuma', 'curcuma'),
('Curry', 'curry', 'curry'),
('Câpre', 'capre', 'capre'),
('Céleri', 'celeri', 'celeri'),
('Céleri-rave', 'celeri rave', 'celeri-rave'),
('Datte', 'datte', 'datte'),
('Dinde', 'dinde', 'dinde'),
('Eau', 'eau', 'eau'),
('Edam', 'edam', 'edam'),
('Emmental', 'emmental', 'emmental'),
('Endive', 'endive', 'endive'),
('Estragon', 'estragon', 'estragon'),
('Farine', 'farine', 'farine'),
('Fenouil', 'fenouil', 'fenouil'),
('Feta', 'feta', 'feta'),
('Figue', 'figue', 'figue'),
('Foie gras', 'foie gras', 'foie-gras'),
('Fond de veau', 'fond de veau', 'fond-de-veau'),
('Fraise', 'fraise', 'fraise'),
('Framboise', 'framboise', 'framboise'),
('Fromage blanc', 'fromage blanc', 'fromage-blanc'),
('Fromage de chèvre', 'fromage de chevre', 'fromage-de-chevre'),
('Fusilli', 'fusilli', 'fusilli'),
('Fève', 'feve', 'feve'),
('Fécule de maïs', 'fecule de mais', 'fecule-de-mais'),
('Gambas', 'gambas', 'gambas'),
('Gingembre', 'gingembre', 'gingembre'),
('Gorgonzola', 'gorgonzola', 'gorgonzola'),
('Gouda', 'gouda', 'gouda'),
('Graines de courge', 'graines de courge', 'graines-de-courge'),
('Grenade', 'grenade', 'grenade'),
('Gruyère', 'gruyere', 'gruyere'),
('Haricot blanc', 'haricot blanc', 'haricot-blanc'),
('Haricot rouge', 'haricot rouge', 'haricot-rouge'),
('Haricot vert', 'haricot vert', 'haricot-vert'),
('Harissa', 'harissa', 'harissa'),
('Herbes de Provence', 'herbes de provence', 'herbes-de-provence'),
('Huile d''olive', 'huile d olive', 'huile-d-olive'),
('Huile de sésame', 'huile de sesame', 'huile-de-sesame'),
('Huile de tournesol', 'huile de tournesol', 'huile-de-tournesol'),
('Huître', 'huitre', 'huitre'),
('Jambon', 'jambon', 'jambon'),
('Ketchup', 'ketchup', 'ketchup'),
('Kiwi', 'kiwi', 'kiwi'),
('Lait', 'lait', 'lait'),
('Lait d''amande', 'lait d amande', 'lait-d-amande'),
('Lait d''avoine', 'lait d avoine', 'lait-d-avoine'),
('Lait de coco', 'lait de coco', 'lait-de-coco'),
('Laitue', 'laitue', 'laitue'),
('Langouste', 'langouste', 'langouste'),
('Lardons', 'lardons', 'lardons'),
('Laurier', 'laurier', 'laurier'),
('Lentille', 'lentille', 'lentille'),
('Lentille corail', 'lentille corail', 'lentille-corail'),
('Levure boulangère', 'levure boulangere', 'levure-boulangere'),
('Levure chimique', 'levure chimique', 'levure-chimique'),
('Lieu noir', 'lieu noir', 'lieu-noir'),
('Litchi', 'litchi', 'litchi'),
('Mangue', 'mangue', 'mangue'),
('Mascarpone', 'mascarpone', 'mascarpone'),
('Mayonnaise', 'mayonnaise', 'mayonnaise'),
('Maïs', 'mais', 'mais'),
('Maïzena', 'maizena', 'maizena'),
('Melon', 'melon', 'melon'),
('Menthe', 'menthe', 'menthe'),
('Miel', 'miel', 'miel'),
('Mimolette', 'mimolette', 'mimolette'),
('Moules', 'moules', 'moules'),
('Moutarde', 'moutarde', 'moutarde'),
('Moutarde à l''ancienne', 'moutarde a l ancienne', 'moutarde-a-l-ancienne'),
('Mozzarella', 'mozzarella', 'mozzarella'),
('Muscade', 'muscade', 'muscade'),
('Myrtilles', 'myrtilles', 'myrtilles'),
('Mâche', 'mache', 'mache'),
('Mûre', 'mure', 'mure'),
('Navet', 'navet', 'navet'),
('Nectarine', 'nectarine', 'nectarine'),
('Noisette', 'noisette', 'noisette'),
('Noix', 'noix', 'noix'),
('Noix de coco', 'noix de coco', 'noix-de-coco'),
('Noix de muscade', 'noix de muscade', 'noix-de-muscade'),
('Noix de pécan', 'noix de pecan', 'noix-de-pecan'),
('Noix de Saint-Jacques', 'noix de saint jacques', 'noix-de-saint-jacques'),
('Nouille', 'nouille', 'nouille'),
('Oeuf', 'oeuf', 'oeuf'),
('Oignon', 'oignon', 'oignon'),
('Oignon rouge', 'oignon rouge', 'oignon-rouge'),
('Olive', 'olive', 'olive'),
('Orange', 'orange', 'orange'),
('Origan', 'origan', 'origan'),
('Pamplemousse', 'pamplemousse', 'pamplemousse'),
('Papaye', 'papaye', 'papaye'),
('Paprika', 'paprika', 'paprika'),
('Parmesan', 'parmesan', 'parmesan'),
('Pastèque', 'pasteque', 'pasteque'),
('Patate douce', 'patate douce', 'patate-douce'),
('Persil', 'persil', 'persil'),
('Pesto', 'pesto', 'pesto'),
('Petit pois', 'petit pois', 'petit-pois'),
('Pignons de pin', 'pignons de pin', 'pignons-de-pin'),
('Piment', 'piment', 'piment'),
('Pistache', 'pistache', 'pistache'),
('Poire', 'poire', 'poire'),
('Poireau', 'poireau', 'poireau'),
('Poivre blanc', 'poivre blanc', 'poivre-blanc'),
('Poivre noir', 'poivre noir', 'poivre-noir'),
('Poivre vert', 'poivre vert', 'poivre-vert'),
('Poivron', 'poivron', 'poivron'),
('Polenta', 'polenta', 'polenta'),
('Pomme', 'pomme', 'pomme'),
('Pomme de terre', 'pomme de terre', 'pomme-de-terre'),
('Porc', 'porc', 'porc'),
('Poulet', 'poulet', 'poulet'),
('Prune', 'prune', 'prune'),
('Pâtes', 'pates', 'pates'),
('Pêche', 'peche', 'peche'),
('Quinoa', 'quinoa', 'quinoa'),
('Radis', 'radis', 'radis'),
('Raifort', 'raifort', 'raifort'),
('Raquette', 'raquette', 'raquette'),
('Reblochon', 'reblochon', 'reblochon'),
('Rhubarbe', 'rhubarbe', 'rhubarbe'),
('Rhum', 'rhum', 'rhum'),
('Ricotta', 'ricotta', 'ricotta'),
('Riz', 'riz', 'riz'),
('Riz basmati', 'riz basmati', 'riz-basmati'),
('Romarin', 'romarin', 'romarin'),
('Roquefort', 'roquefort', 'roquefort'),
('Roquette', 'roquette', 'roquette'),
('Safran', 'safran', 'safran'),
('Saint-Nectaire', 'saint nectaire', 'saint-nectaire'),
('Salade', 'salade', 'salade'),
('Sauce béchamel', 'sauce bechamel', 'sauce-bechamel'),
('Sauce soja', 'sauce soja', 'sauce-soja'),
('Sauce tomate', 'sauce tomate', 'sauce-tomate'),
('Sauce Worcestershire', 'sauce worcestershire', 'sauce-worcestershire'),
('Saucisses', 'saucisses', 'saucisses'),
('Sauge', 'sauge', 'sauge'),
('Saumon', 'saumon', 'saumon'),
('Sel', 'sel', 'sel'),
('Semoule', 'semoule', 'semoule'),
('Sirop d''agave', 'sirop d agave', 'sirop-d-agave'),
('Sirop de grenadine', 'sirop de grenadine', 'sirop-de-grenadine'),
('Soja', 'soja', 'soja'),
('Sole', 'sole', 'sole'),
('Sucre', 'sucre', 'sucre'),
('Sucre glace', 'sucre glace', 'sucre-glace'),
('Sucre roux', 'sucre roux', 'sucre-roux'),
('Sésame', 'sesame', 'sesame'),
('Tapioca', 'tapioca', 'tapioca'),
('Thé', 'the', 'the'),
('Thon', 'thon', 'thon'),
('Thym', 'thym', 'thym'),
('Tofu', 'tofu', 'tofu'),
('Tomate', 'tomate', 'tomate'),
('Tomate cerise', 'tomate cerise', 'tomate-cerise'),
('Truite', 'truite', 'truite'),
('Vanille', 'vanille', 'vanille'),
('Veau', 'veau', 'veau'),
('Vermicelle', 'vermicelle', 'vermicelle'),
('Vinaigre', 'vinaigre', 'vinaigre'),
('Vinaigre balsamique', 'vinaigre balsamique', 'vinaigre-balsamique'),
('Vinaigre de cidre', 'vinaigre de cidre', 'vinaigre-de-cidre'),
('Vinaigre de vin', 'vinaigre de vin', 'vinaigre-de-vin'),
('Vodka', 'vodka', 'vodka'),
('Yaourt', 'yaourt', 'yaourt'),
('Yaourt nature', 'yaourt nature', 'yaourt-nature'),
('Échalote', 'echalote', 'echalote'),
('Écrevisse', 'ecrevisse', 'ecrevisse'),
('Épinard', 'epinard', 'epinard')
AS new_row
ON DUPLICATE KEY UPDATE
  Name = new_row.Name,
  NormalizedName = new_row.NormalizedName,
  Slug = new_row.Slug;

-- =====================================================
-- Tag groups
-- =====================================================
INSERT INTO TagGroups (Id, Name, Slug, SortOrder) VALUES
(1, 'Régimes alimentaires', 'regimes-alimentaires', 1),
(2, 'Nutrition', 'nutrition', 2),
(3, 'Difficulté', 'difficulte', 3),
(4, 'Temps', 'temps', 4),
(5, 'Occasion', 'occasion', 5),
(6, 'Ambiance / Style', 'ambiance-style', 6),
(7, 'Technique', 'technique', 7),
(8, 'Cuisines du monde', 'cuisines-du-monde', 8)
AS new_row
ON DUPLICATE KEY UPDATE
  Name = new_row.Name,
  Slug = new_row.Slug,
  SortOrder = new_row.SortOrder;

-- =====================================================
-- Tags
-- =====================================================
INSERT INTO Tags (Name, NormalizedName, Slug, GroupId) VALUES
-- Régimes alimentaires
('Végétarien', 'vegetarien', 'vegetarien', 1),
('Vegan', 'vegan', 'vegan', 1),
('Sans gluten', 'sans gluten', 'sans-gluten', 1),
('Sans lactose', 'sans lactose', 'sans-lactose', 1),
('Sans sucre ajouté', 'sans sucre ajoute', 'sans-sucre-ajoute', 1),
('Cétogène', 'cetogene', 'cetogene', 1),
('Halal', 'halal', 'halal', 1),
('Casher', 'casher', 'casher', 1),
('Sans noix', 'sans noix', 'sans-noix', 1),
('Sans oeuf', 'sans oeuf', 'sans-oeuf', 1),
('Sans porc', 'sans porc', 'sans-porc', 1),
('Paléo', 'paleo', 'paleo', 1),
('Cru', 'cru', 'cru', 1),
-- Nutrition
('Healthy', 'healthy', 'healthy', 2),
('Light', 'light', 'light', 2),
('Protéiné', 'proteine', 'proteine', 2),
('Riche en fibres', 'riche en fibres', 'riche-fibres', 2),
('Faible en calories', 'faible en calories', 'faible-calories', 2),
('Riche en fer', 'riche en fer', 'riche-fer', 2),
('Riche en oméga-3', 'riche en omega 3', 'riche-omega-3', 2),
('Anti-inflammatoire', 'anti inflammatoire', 'anti-inflammatoire', 2),
-- Difficulté
('Facile', 'facile', 'facile', 3),
('Intermédiaire', 'intermediaire', 'intermediaire', 3),
('Difficile', 'difficile', 'difficile', 3),
-- Temps
('Très rapide', 'tres rapide', 'tres-rapide', 4),
('Rapide', 'rapide', 'rapide', 4),
('Longue cuisson', 'longue cuisson', 'longue-cuisson', 4),
('Marinade', 'marinade', 'marinade', 4),
('Sans cuisson', 'sans cuisson', 'sans-cuisson', 4),
('Une seule casserole', 'une seule casserole', 'une-seule-casserole', 4),
-- Occasion
('Anniversaire', 'anniversaire', 'anniversaire', 5),
('Noël', 'noel', 'noel', 5),
('Pâques', 'paques', 'paques', 5),
('Saint-Valentin', 'saint valentin', 'saint-valentin', 5),
('Repas de fête', 'repas de fete', 'repas-fete', 5),
('Brunch', 'brunch', 'brunch', 5),
('Barbecue', 'barbecue', 'barbecue', 5),
('Pique-nique', 'pique nique', 'pique-nique', 5),
('Ramadan', 'ramadan', 'ramadan', 5),
('Halloween', 'halloween', 'halloween', 5),
('Nouvel An', 'nouvel an', 'nouvel-an', 5),
-- Ambiance / Style
('Comfort food', 'comfort food', 'comfort-food', 6),
('Fait maison', 'fait maison', 'fait-maison', 6),
('Économique', 'economique', 'economique', 6),
('Batch cooking', 'batch cooking', 'batch-cooking', 6),
('Cuisine de saison', 'cuisine de saison', 'cuisine-saison', 6),
('Recette de grand-mère', 'recette de grand mere', 'recette-grand-mere', 6),
-- Technique
('Mijoté', 'mijote', 'mijote', 7),
('Grillé', 'grille', 'grille', 7),
('Frit', 'frit', 'frit', 7),
('Vapeur', 'vapeur', 'vapeur', 7),
('Cuit au four', 'cuit au four', 'cuit-au-four', 7),
('Fermenté', 'fermente', 'fermente', 7),
('Fumé', 'fume', 'fume', 7),
-- Cuisines du monde
('Cuisine française', 'cuisine francaise', 'cuisine-francaise', 8),
('Cuisine italienne', 'cuisine italienne', 'cuisine-italienne', 8),
('Cuisine asiatique', 'cuisine asiatique', 'cuisine-asiatique', 8),
('Cuisine japonaise', 'cuisine japonaise', 'cuisine-japonaise', 8),
('Cuisine chinoise', 'cuisine chinoise', 'cuisine-chinoise', 8),
('Cuisine thaïlandaise', 'cuisine thailandaise', 'cuisine-thailandaise', 8),
('Cuisine indienne', 'cuisine indienne', 'cuisine-indienne', 8),
('Cuisine libanaise', 'cuisine libanaise', 'cuisine-libanaise', 8),
('Cuisine mexicaine', 'cuisine mexicaine', 'cuisine-mexicaine', 8),
('Cuisine orientale', 'cuisine orientale', 'cuisine-orientale', 8),
('Cuisine méditerranéenne', 'cuisine mediterraneenne', 'cuisine-mediterraneenne', 8),
('Cuisine grecque', 'cuisine grecque', 'cuisine-grecque', 8),
('Cuisine espagnole', 'cuisine espagnole', 'cuisine-espagnole', 8),
('Cuisine américaine', 'cuisine americaine', 'cuisine-americaine', 8),
('Cuisine africaine', 'cuisine africaine', 'cuisine-africaine', 8),
('Cuisine antillaise', 'cuisine antillaise', 'cuisine-antillaise', 8),
('Cuisine brésilienne', 'cuisine bresilienne', 'cuisine-bresilienne', 8)
AS new_row
ON DUPLICATE KEY UPDATE
  Name = new_row.Name,
  NormalizedName = new_row.NormalizedName,
  Slug = new_row.Slug,
  GroupId = new_row.GroupId;

-- =====================================================
-- Équipments
-- =====================================================
INSERT INTO Equipments (Name, Slug) VALUES
('Aiguille à brider', 'aiguille-a-brider'),
('Attendrisseur à viande', 'attendrisseur-a-viande'),
('Autocuiseur', 'autocuiseur'),
('Balance de cuisine', 'balance-de-cuisine'),
('Batteur électrique', 'batteur-electrique'),
('Bocal', 'bocal'),
('Bol mélangeur', 'bol-melangeur'),
('Bouilloire', 'bouilloire'),
('Brosse à pâtisserie', 'brosse-a-patisserie'),
('Broche', 'broche'),
('Casserole', 'casserole'),
('Casserole à lait', 'casserole-a-lait'),
('Cercle à pâtisserie', 'cercle-a-patisserie'),
('Chalumeau de cuisine', 'chalumeau-de-cuisine'),
('Chinois', 'chinois'),
('Ciseaux de cuisine', 'ciseaux-de-cuisine'),
('Corne de pâtisserie', 'corne-de-patisserie'),
('Couperet', 'couperet'),
('Coupe-œuf', 'coupe-uf'),
('Couteau à pain', 'couteau-a-pain'),
('Couteau d''office', 'couteau-d-office'),
('Couteau de cuisine', 'couteau-de-cuisine'),
('Couteau éminceur', 'couteau-eminceur'),
('Crêpière', 'crepiere'),
('Cuiseur vapeur', 'cuiseur-vapeur'),
('Cuillère en bois', 'cuillere-en-bois'),
('Cul-de-poule', 'cul-de-poule'),
('Découpoir', 'decoupoir'),
('Essoreuse à salade', 'essoreuse-a-salade'),
('Faitout', 'faitout'),
('Film alimentaire', 'film-alimentaire'),
('Fouet', 'fouet'),
('Four', 'four'),
('Fourchette de cuisine', 'fourchette-de-cuisine'),
('Friteuse', 'friteuse'),
('Gant de cuisine', 'gant-de-cuisine'),
('Gaufrier', 'gaufrier'),
('Grille-pain', 'grille-pain'),
('Grille de refroidissement', 'grille-de-refroidissement'),
('Hachoir', 'hachoir'),
('Lèchefrite', 'lechefrite'),
('Louche', 'louche'),
('Mandoline', 'mandoline'),
('Marmite', 'marmite'),
('Maryse', 'maryse'),
('Mixeur', 'mixeur'),
('Moule à cake', 'moule-a-cake'),
('Moule à manqué', 'moule-a-manque'),
('Moule à muffins', 'moule-a-muffins'),
('Moule à soufflé', 'moule-a-souffle'),
('Moule à tarte', 'moule-a-tarte'),
('Moule en silicone', 'moule-en-silicone'),
('Papier aluminium', 'papier-aluminium'),
('Papier cuisson', 'papier-cuisson'),
('Passoire', 'passoire'),
('Pelle à tarte', 'pelle-a-tarte'),
('Pilon', 'pilon'),
('Pince de cuisine', 'pince-de-cuisine'),
('Pinceau de cuisine', 'pinceau-de-cuisine'),
('Planche à découper', 'planche-a-decouper'),
('Plaque de cuisson', 'plaque-de-cuisson'),
('Plateau tournant', 'plateau-tournant'),
('Poche à douille', 'poche-a-douille'),
('Poêle', 'poele'),
('Poêle à crêpes', 'poele-a-crepes'),
('Presse-agrumes', 'presse-agrumes'),
('Presse-purée', 'presse-puree'),
('Ramequin', 'ramequin'),
('Robot de cuisine', 'robot-de-cuisine'),
('Rouleau à pâtisserie', 'rouleau-a-patisserie'),
('Râpe', 'rape'),
('Sac de congélation', 'sac-de-congelation'),
('Saladier', 'saladier'),
('Sauteuse', 'sauteuse'),
('Siphon de cuisine', 'siphon-de-cuisine'),
('Spatule', 'spatule'),
('Tamis', 'tamis'),
('Terrine', 'terrine'),
('Verre doseur', 'verre-doseur'),
('Wok', 'wok'),
('Zesteur', 'zesteur'),
('Écumoire', 'ecumoire'),
('Épluche-légumes', 'epluche-legumes')
AS new_row ON DUPLICATE KEY UPDATE Slug = new_row.Slug;

COMMIT;
