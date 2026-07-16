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
(2,  'users.read', "Consulter les comptes community et leur historique de modération"),
(3,  'users.moderate', "Bannir et réactiver des comptes community"),
(4,  'recipes.read', "Consulter les recettes dans l'administration"),
(5,  'recipes.moderate', "Approuver et rejeter les recettes en attente"),
(6,  'recipes.archive', "Archiver les recettes publiées ou rejetées"),
(7,  'recipes.delete', "Supprimer définitivement des recettes"),
(8,  'comments.read', "Consulter les commentaires dans l'administration"),
(9,  'comments.moderate', "Masquer, restaurer et démodérer des commentaires"),
(10, 'comments.update', "Modifier des commentaires dans l'administration"),
(11, 'comments.delete', "Supprimer définitivement des commentaires"),
(12, 'catalog.read', "Consulter le catalogue dans l'administration"),
(13, 'catalog.manage', "Créer, modifier et supprimer des catégories, ingrédients, tags et ustensiles"),
(14, 'staff.read', "Consulter les comptes staff et leurs rôles"),
(15, 'staff.manage', "Inviter, modifier, désactiver et gérer les rôles des comptes staff"),
(16, 'audit.read', "Consulter le journal d'audit administratif")
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
  SELECT 'RecipeModerator' AS RoleCode, 'recipes.read' AS PermissionCode
  UNION ALL SELECT 'RecipeModerator', 'recipes.moderate'
  UNION ALL SELECT 'RecipeModerator', 'recipes.archive'
  -- CommentModerator: consultation et modération réversible, sans suppression définitive.
  UNION ALL SELECT 'CommentModerator', 'comments.read'
  UNION ALL SELECT 'CommentModerator', 'comments.moderate'
  UNION ALL SELECT 'CommentModerator', 'comments.update'
  -- UserAdmin: consultation et modération des seuls comptes community.
  UNION ALL SELECT 'UserAdmin', 'users.read'
  UNION ALL SELECT 'UserAdmin', 'users.moderate'
  -- CatalogManager: gestion complète des données du catalogue.
  UNION ALL SELECT 'CatalogManager', 'catalog.read'
  UNION ALL SELECT 'CatalogManager', 'catalog.manage'
  -- SuperAdmin: catalogue explicite complet, sans wildcard ni héritage de rôle.
  UNION ALL SELECT 'SuperAdmin', 'system.health.read'
  UNION ALL SELECT 'SuperAdmin', 'users.read'
  UNION ALL SELECT 'SuperAdmin', 'users.moderate'
  UNION ALL SELECT 'SuperAdmin', 'recipes.read'
  UNION ALL SELECT 'SuperAdmin', 'recipes.moderate'
  UNION ALL SELECT 'SuperAdmin', 'recipes.archive'
  UNION ALL SELECT 'SuperAdmin', 'recipes.delete'
  UNION ALL SELECT 'SuperAdmin', 'comments.read'
  UNION ALL SELECT 'SuperAdmin', 'comments.moderate'
  UNION ALL SELECT 'SuperAdmin', 'comments.update'
  UNION ALL SELECT 'SuperAdmin', 'comments.delete'
  UNION ALL SELECT 'SuperAdmin', 'catalog.read'
  UNION ALL SELECT 'SuperAdmin', 'catalog.manage'
  UNION ALL SELECT 'SuperAdmin', 'staff.read'
  UNION ALL SELECT 'SuperAdmin', 'staff.manage'
  UNION ALL SELECT 'SuperAdmin', 'audit.read'
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
INSERT INTO Ingredients (Name, Slug) VALUES
('Abondance', 'abondance'),
('Abricot', 'abricot'),
('Agar-agar', 'agar-agar'),
('Agneau', 'agneau'),
('Ail', 'ail'),
('Ail des ours', 'ail-des-ours'),
('Airelle', 'airelle'),
('Algue', 'algue'),
('Aloe vera', 'aloe-vera'),
('Amande', 'amande'),
('Amarante', 'amarante'),
('Ananas', 'ananas'),
('Anchois', 'anchois'),
('Andouillette', 'andouillette'),
('Aneth', 'aneth'),
('Anguille', 'anguille'),
('Angélique', 'angelique'),
('Anis', 'anis'),
('Araignée de mer', 'araignee-de-mer'),
('Arnica', 'arnica'),
('Artichaut', 'artichaut'),
('Asperge', 'asperge'),
('Aubergine', 'aubergine'),
('Aubépine', 'aubepine'),
('Avocat', 'avocat'),
('Babeurre', 'babeurre'),
('Bacon', 'bacon'),
('Badiane', 'badiane'),
('Baie rose', 'baie-rose'),
('Banane', 'banane'),
('Bar', 'bar'),
('Basilic', 'basilic'),
('Baudroie', 'baudroie'),
('Bavette', 'bavette'),
('Betterave', 'betterave'),
('Beurre', 'beurre'),
('Beurre demi-sel', 'beurre-demi-sel'),
('Beurre doux', 'beurre-doux'),
('Bicarbonate de soude', 'bicarbonate-de-soude'),
('Biscotte', 'biscotte'),
('Bière', 'biere'),
('Blanc de poulet', 'blanc-de-poulet'),
('Blette', 'blette'),
('Bleu d''Auvergne', 'bleu-d-auvergne'),
('Blé', 'ble'),
('Boeuf', 'boeuf'),
('Boeuf haché', 'boeuf-hache'),
('Bolet', 'bolet'),
('Bouillon de légumes', 'bouillon-de-legumes'),
('Bouillon de poulet', 'bouillon-de-poulet'),
('Boulgour', 'boulgour'),
('Bourrache', 'bourrache'),
('Brocoli', 'brocoli'),
('Brousse', 'brousse'),
('Brugnon', 'brugnon'),
('Cacahuète', 'cacahuete'),
('Cacao', 'cacao'),
('Café', 'cafe'),
('Caille', 'caille'),
('Calamar', 'calamar'),
('Camembert', 'camembert'),
('Canard', 'canard'),
('Cannelle', 'cannelle'),
('Cantal', 'cantal'),
('Capre', 'capre'),
('Caramel', 'caramel'),
('Cardamome', 'cardamome'),
('Carotte', 'carotte'),
('Cassis', 'cassis'),
('Cerfeuil', 'cerfeuil'),
('Cerise', 'cerise'),
('Champignon', 'champignon'),
('Cheddar', 'cheddar'),
('Chicorée', 'chicoree'),
('Chili', 'chili'),
('Chocolat', 'chocolat'),
('Chocolat au lait', 'chocolat-au-lait'),
('Chocolat blanc', 'chocolat-blanc'),
('Chocolat noir', 'chocolat-noir'),
('Chorizo', 'chorizo'),
('Chou', 'chou'),
('Chou blanc', 'chou-blanc'),
('Chou kale', 'chou-kale'),
('Chou-fleur', 'chou-fleur'),
('Châtaigne', 'chataigne'),
('Chèvre', 'chevre'),
('Ciboulette', 'ciboulette'),
('Cidre', 'cidre'),
('Citron', 'citron'),
('Citron vert', 'citron-vert'),
('Clou de girofle', 'clou-de-girofle'),
('Clémentine', 'clementine'),
('Coing', 'coing'),
('Comté', 'comte'),
('Concentré de tomate', 'concentre-de-tomate'),
('Concombre', 'concombre'),
('Coriandre', 'coriandre'),
('Cornichon', 'cornichon'),
('Courge', 'courge'),
('Courgette', 'courgette'),
('Couscous', 'couscous'),
('Crabe', 'crabe'),
('Cresson', 'cresson'),
('Crevette', 'crevette'),
('Crème fraîche', 'creme-fraiche'),
('Crème liquide', 'creme-liquide'),
('Crème épaisse', 'creme-epaisse'),
('Cumin', 'cumin'),
('Curcuma', 'curcuma'),
('Curry', 'curry'),
('Câpre', 'capre'),
('Céleri', 'celeri'),
('Céleri-rave', 'celeri-rave'),
('Datte', 'datte'),
('Dinde', 'dinde'),
('Eau', 'eau'),
('Edam', 'edam'),
('Emmental', 'emmental'),
('Endive', 'endive'),
('Estragon', 'estragon'),
('Farine', 'farine'),
('Fenouil', 'fenouil'),
('Feta', 'feta'),
('Figue', 'figue'),
('Foie gras', 'foie-gras'),
('Fond de veau', 'fond-de-veau'),
('Fraise', 'fraise'),
('Framboise', 'framboise'),
('Fromage blanc', 'fromage-blanc'),
('Fromage de chèvre', 'fromage-de-chevre'),
('Fusilli', 'fusilli'),
('Fève', 'feve'),
('Fécule de maïs', 'fecule-de-mais'),
('Gambas', 'gambas'),
('Gingembre', 'gingembre'),
('Gorgonzola', 'gorgonzola'),
('Gouda', 'gouda'),
('Graines de courge', 'graines-de-courge'),
('Grenade', 'grenade'),
('Gruyère', 'gruyere'),
('Haricot blanc', 'haricot-blanc'),
('Haricot rouge', 'haricot-rouge'),
('Haricot vert', 'haricot-vert'),
('Harissa', 'harissa'),
('Herbes de Provence', 'herbes-de-provence'),
('Huile d''olive', 'huile-d-olive'),
('Huile de sésame', 'huile-de-sesame'),
('Huile de tournesol', 'huile-de-tournesol'),
('Huître', 'huitre'),
('Jambon', 'jambon'),
('Ketchup', 'ketchup'),
('Kiwi', 'kiwi'),
('Lait', 'lait'),
('Lait d''amande', 'lait-d-amande'),
('Lait d''avoine', 'lait-d-avoine'),
('Lait de coco', 'lait-de-coco'),
('Laitue', 'laitue'),
('Langouste', 'langouste'),
('Lardons', 'lardons'),
('Laurier', 'laurier'),
('Lentille', 'lentille'),
('Lentille corail', 'lentille-corail'),
('Levure boulangère', 'levure-boulangere'),
('Levure chimique', 'levure-chimique'),
('Lieu noir', 'lieu-noir'),
('Litchi', 'litchi'),
('Mangue', 'mangue'),
('Mascarpone', 'mascarpone'),
('Mayonnaise', 'mayonnaise'),
('Maïs', 'mais'),
('Maïzena', 'maizena'),
('Melon', 'melon'),
('Menthe', 'menthe'),
('Miel', 'miel'),
('Mimolette', 'mimolette'),
('Moules', 'moules'),
('Moutarde', 'moutarde'),
('Moutarde à l''ancienne', 'moutarde-a-l-ancienne'),
('Mozzarella', 'mozzarella'),
('Muscade', 'muscade'),
('Myrtilles', 'myrtilles'),
('Mâche', 'mache'),
('Mûre', 'mure'),
('Navet', 'navet'),
('Nectarine', 'nectarine'),
('Noisette', 'noisette'),
('Noix', 'noix'),
('Noix de coco', 'noix-de-coco'),
('Noix de muscade', 'noix-de-muscade'),
('Noix de pécan', 'noix-de-pecan'),
('Noix de Saint-Jacques', 'noix-de-saint-jacques'),
('Nouille', 'nouille'),
('Oeuf', 'oeuf'),
('Oignon', 'oignon'),
('Oignon rouge', 'oignon-rouge'),
('Olive', 'olive'),
('Orange', 'orange'),
('Origan', 'origan'),
('Pamplemousse', 'pamplemousse'),
('Papaye', 'papaye'),
('Paprika', 'paprika'),
('Parmesan', 'parmesan'),
('Pastèque', 'pasteque'),
('Patate douce', 'patate-douce'),
('Persil', 'persil'),
('Pesto', 'pesto'),
('Petit pois', 'petit-pois'),
('Pignons de pin', 'pignons-de-pin'),
('Piment', 'piment'),
('Pistache', 'pistache'),
('Poire', 'poire'),
('Poireau', 'poireau'),
('Poivre blanc', 'poivre-blanc'),
('Poivre noir', 'poivre-noir'),
('Poivre vert', 'poivre-vert'),
('Poivron', 'poivron'),
('Polenta', 'polenta'),
('Pomme', 'pomme'),
('Pomme de terre', 'pomme-de-terre'),
('Porc', 'porc'),
('Poulet', 'poulet'),
('Prune', 'prune'),
('Pâtes', 'pates'),
('Pêche', 'peche'),
('Quinoa', 'quinoa'),
('Radis', 'radis'),
('Raifort', 'raifort'),
('Raquette', 'raquette'),
('Reblochon', 'reblochon'),
('Rhubarbe', 'rhubarbe'),
('Rhum', 'rhum'),
('Ricotta', 'ricotta'),
('Riz', 'riz'),
('Riz basmati', 'riz-basmati'),
('Romarin', 'romarin'),
('Roquefort', 'roquefort'),
('Roquette', 'roquette'),
('Safran', 'safran'),
('Saint-Nectaire', 'saint-nectaire'),
('Salade', 'salade'),
('Sauce béchamel', 'sauce-bechamel'),
('Sauce soja', 'sauce-soja'),
('Sauce tomate', 'sauce-tomate'),
('Sauce Worcestershire', 'sauce-worcestershire'),
('Saucisses', 'saucisses'),
('Sauge', 'sauge'),
('Saumon', 'saumon'),
('Sel', 'sel'),
('Semoule', 'semoule'),
('Sirop d''agave', 'sirop-d-agave'),
('Sirop de grenadine', 'sirop-de-grenadine'),
('Soja', 'soja'),
('Sole', 'sole'),
('Sucre', 'sucre'),
('Sucre glace', 'sucre-glace'),
('Sucre roux', 'sucre-roux'),
('Sésame', 'sesame'),
('Tapioca', 'tapioca'),
('Thé', 'the'),
('Thon', 'thon'),
('Thym', 'thym'),
('Tofu', 'tofu'),
('Tomate', 'tomate'),
('Tomate cerise', 'tomate-cerise'),
('Truite', 'truite'),
('Vanille', 'vanille'),
('Veau', 'veau'),
('Vermicelle', 'vermicelle'),
('Vinaigre', 'vinaigre'),
('Vinaigre balsamique', 'vinaigre-balsamique'),
('Vinaigre de cidre', 'vinaigre-de-cidre'),
('Vinaigre de vin', 'vinaigre-de-vin'),
('Vodka', 'vodka'),
('Yaourt', 'yaourt'),
('Yaourt nature', 'yaourt-nature'),
('Échalote', 'echalote'),
('Écrevisse', 'ecrevisse'),
('Épinard', 'epinard')
AS new_row ON DUPLICATE KEY UPDATE Slug = new_row.Slug;

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
INSERT INTO Tags (Name, Slug, GroupId) VALUES
-- Régimes alimentaires
('Végétarien', 'vegetarien', 1),
('Vegan', 'vegan', 1),
('Sans gluten', 'sans-gluten', 1),
('Sans lactose', 'sans-lactose', 1),
('Sans sucre ajouté', 'sans-sucre-ajoute', 1),
('Cétogène', 'cetogene', 1),
('Halal', 'halal', 1),
('Casher', 'casher', 1),
('Sans noix', 'sans-noix', 1),
('Sans oeuf', 'sans-oeuf', 1),
('Sans porc', 'sans-porc', 1),
('Paléo', 'paleo', 1),
('Cru', 'cru', 1),
-- Nutrition
('Healthy', 'healthy', 2),
('Light', 'light', 2),
('Protéiné', 'proteine', 2),
('Riche en fibres', 'riche-fibres', 2),
('Faible en calories', 'faible-calories', 2),
('Riche en fer', 'riche-fer', 2),
('Riche en oméga-3', 'riche-omega-3', 2),
('Anti-inflammatoire', 'anti-inflammatoire', 2),
-- Difficulté
('Facile', 'facile', 3),
('Intermédiaire', 'intermediaire', 3),
('Difficile', 'difficile', 3),
-- Temps
('Très rapide', 'tres-rapide', 4),
('Rapide', 'rapide', 4),
('Longue cuisson', 'longue-cuisson', 4),
('Marinade', 'marinade', 4),
('Sans cuisson', 'sans-cuisson', 4),
('Une seule casserole', 'une-seule-casserole', 4),
-- Occasion
('Anniversaire', 'anniversaire', 5),
('Noël', 'noel', 5),
('Pâques', 'paques', 5),
('Saint-Valentin', 'saint-valentin', 5),
('Repas de fête', 'repas-fete', 5),
('Brunch', 'brunch', 5),
('Barbecue', 'barbecue', 5),
('Pique-nique', 'pique-nique', 5),
('Ramadan', 'ramadan', 5),
('Halloween', 'halloween', 5),
('Nouvel An', 'nouvel-an', 5),
-- Ambiance / Style
('Comfort food', 'comfort-food', 6),
('Fait maison', 'fait-maison', 6),
('Économique', 'economique', 6),
('Batch cooking', 'batch-cooking', 6),
('Cuisine de saison', 'cuisine-saison', 6),
('Recette de grand-mère', 'recette-grand-mere', 6),
-- Technique
('Mijoté', 'mijote', 7),
('Grillé', 'grille', 7),
('Frit', 'frit', 7),
('Vapeur', 'vapeur', 7),
('Cuit au four', 'cuit-au-four', 7),
('Fermenté', 'fermente', 7),
('Fumé', 'fume', 7),
-- Cuisines du monde
('Cuisine française', 'cuisine-francaise', 8),
('Cuisine italienne', 'cuisine-italienne', 8),
('Cuisine asiatique', 'cuisine-asiatique', 8),
('Cuisine japonaise', 'cuisine-japonaise', 8),
('Cuisine chinoise', 'cuisine-chinoise', 8),
('Cuisine thaïlandaise', 'cuisine-thailandaise', 8),
('Cuisine indienne', 'cuisine-indienne', 8),
('Cuisine libanaise', 'cuisine-libanaise', 8),
('Cuisine mexicaine', 'cuisine-mexicaine', 8),
('Cuisine orientale', 'cuisine-orientale', 8),
('Cuisine méditerranéenne', 'cuisine-mediterraneenne', 8),
('Cuisine grecque', 'cuisine-grecque', 8),
('Cuisine espagnole', 'cuisine-espagnole', 8),
('Cuisine américaine', 'cuisine-americaine', 8),
('Cuisine africaine', 'cuisine-africaine', 8),
('Cuisine antillaise', 'cuisine-antillaise', 8),
('Cuisine brésilienne', 'cuisine-bresilienne', 8)
AS new_row
ON DUPLICATE KEY UPDATE
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
