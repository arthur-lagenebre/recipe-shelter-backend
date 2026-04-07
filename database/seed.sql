USE recipe_shelter;

SET NAMES utf8mb4;

START TRANSACTION;

-- ---------- Roles ----------
INSERT INTO Roles (Name) VALUES
('admin'),
('user')
ON DUPLICATE KEY UPDATE Name = VALUES(Name);

-- ---------- Admin user ----------
-- Password: REPLACE_WITH_REAL_HASH (pbkdf2/scrypt/etc) ou bcrypt si tu décides
INSERT INTO Users (Mail, Username, Password, RoleId)
VALUES (
  'admin@recipe-shelter.fr',
  'admin',
  '$2b$12$zrX5iMCRel.f0GtuWfc2J.w8rq7bSuNnFnpd6.ODVPEGhgZlygfBW',
  (SELECT Id FROM Roles WHERE Name = 'admin')
)
ON DUPLICATE KEY UPDATE
  Username = VALUES(Username),
  Password = VALUES(Password),
  RoleId = VALUES(RoleId);

-- ---------- Ingredient categories ----------
INSERT INTO IngredientCategories (Name, Slug) VALUES
('Fruits', 'fruits'),
('Légumes', 'legumes'),
('Viandes', 'viandes'),
('Poissons & Fruits de mer', 'poissons-fruits-mer'),
('Produits laitiers', 'produits-laitiers'),
('Épices & Herbes', 'epices-herbes'),
('Céréales & Féculents', 'cereales-feculents'),
('Légumineuses', 'legumineuses'),
('Huiles & Condiments', 'huiles-condiments'),
('Pâtisserie', 'patisserie')
ON DUPLICATE KEY UPDATE Name = VALUES(Name);

-- ---------- Ingredients (base) ----------
INSERT INTO Ingredients (Name, Slug, CategoryId) VALUES
-- Épices & herbes
('Sel', 'sel', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Poivre noir', 'poivre-noir', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Poivre blanc', 'poivre-blanc', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Paprika', 'paprika', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Cumin', 'cumin', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Curry', 'curry', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Curcuma', 'curcuma', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Piment', 'piment', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Herbes de Provence', 'herbes-provence', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Basilic', 'basilic', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Persil', 'persil', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Coriandre', 'coriandre', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Thym', 'thym', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Romarin', 'romarin', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
('Laurier', 'laurier', (SELECT Id FROM IngredientCategories WHERE Slug='epices-herbes')),
-- Pâtisserie
('Sucre', 'sucre', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Sucre roux', 'sucre-roux', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Sucre glace', 'sucre-glace', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Miel', 'miel', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Farine', 'farine', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Maïzena', 'maizena', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Levure chimique', 'levure-chimique', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Levure boulangère', 'levure-boulangere', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Bicarbonate de soude', 'bicarbonate-soude', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Cacao en poudre', 'cacao-poudre', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Chocolat noir', 'chocolat-noir', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Chocolat au lait', 'chocolat-lait', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Chocolat blanc', 'chocolat-blanc', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Vanille', 'vanille', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
('Cannelle', 'cannelle', (SELECT Id FROM IngredientCategories WHERE Slug='patisserie')),
-- Huiles & condiments
('Huile d''olive', 'huile-olive', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Huile de tournesol', 'huile-tournesol', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Vinaigre balsamique', 'vinaigre-balsamique', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Vinaigre de cidre', 'vinaigre-cidre', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Moutarde', 'moutarde', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Moutarde à l''ancienne', 'moutarde-ancienne', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Sauce soja', 'sauce-soja', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Sauce Worcestershire', 'sauce-worcestershire', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Ketchup', 'ketchup', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Mayonnaise', 'mayonnaise', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
('Pesto', 'pesto', (SELECT Id FROM IngredientCategories WHERE Slug='huiles-condiments')),
-- Produits laitiers
('Lait', 'lait', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Crème fraîche', 'creme-fraiche', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Crème liquide', 'creme-liquide', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Beurre doux', 'beurre-doux', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Beurre demi-sel', 'beurre-demi-sel', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Yaourt nature', 'yaourt-nature', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Fromage blanc', 'fromage-blanc', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Mascarpone', 'mascarpone', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Mozzarella', 'mozzarella', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Parmesan', 'parmesan', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Emmental', 'emmental', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Comté', 'comte', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Gruyère', 'gruyere', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Cheddar', 'cheddar', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Feta', 'feta', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Fromage de chèvre', 'fromage-chevre', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Ricotta', 'ricotta', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
('Oeufs', 'oeufs', (SELECT Id FROM IngredientCategories WHERE Slug='produits-laitiers')),
-- Céréales & féculents
('Riz', 'riz', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Riz basmati', 'riz-basmati', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Pâtes', 'pates', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Semoule', 'semoule', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Couscous', 'couscous', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Quinoa', 'quinoa', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Pommes de terre', 'pommes-de-terre', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Patates douces', 'patates-douces', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
('Pain', 'pain', (SELECT Id FROM IngredientCategories WHERE Slug='cereales-feculents')),
-- Légumes
('Tomates', 'tomates', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Tomates cerises', 'tomates-cerises', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Concentré de tomate', 'concentre-tomate', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Oignons', 'oignons', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Oignons rouges', 'oignons-rouges', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Ail', 'ail', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Échalotes', 'echalotes', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Carottes', 'carottes', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Courgettes', 'courgettes', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Aubergines', 'aubergines', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Poivrons', 'poivrons', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Concombre', 'concombre', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Salade', 'salade', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Roquette', 'roquette', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Épinards', 'epinards', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Champignons', 'champignons', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Brocoli', 'brocoli', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Chou-fleur', 'chou-fleur', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Haricots verts', 'haricots-verts', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Maïs', 'mais', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Avocat', 'avocat', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Poireaux', 'poireaux', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
('Céleri', 'celeri', (SELECT Id FROM IngredientCategories WHERE Slug='legumes')),
-- Fruits
('Pommes', 'pommes', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Bananes', 'bananes', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Fraises', 'fraises', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Framboises', 'framboises', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Myrtilles', 'myrtilles', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Oranges', 'oranges', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Citrons', 'citrons', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
('Citrons verts', 'citrons-verts', (SELECT Id FROM IngredientCategories WHERE Slug='fruits')),
-- Viandes
('Poulet', 'poulet', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Blanc de poulet', 'blanc-de-poulet', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Boeuf', 'boeuf', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Boeuf haché', 'boeuf-hache', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Porc', 'porc', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Lardons', 'lardons', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Jambon', 'jambon', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Bacon', 'bacon', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Saucisses', 'saucisses', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
('Chorizo', 'chorizo', (SELECT Id FROM IngredientCategories WHERE Slug='viandes')),
-- Poissons & fruits de mer
('Saumon', 'saumon', (SELECT Id FROM IngredientCategories WHERE Slug='poissons-fruits-mer')),
('Thon', 'thon', (SELECT Id FROM IngredientCategories WHERE Slug='poissons-fruits-mer')),
('Cabillaud', 'cabillaud', (SELECT Id FROM IngredientCategories WHERE Slug='poissons-fruits-mer')),
('Crevettes', 'crevettes', (SELECT Id FROM IngredientCategories WHERE Slug='poissons-fruits-mer')),
('Moules', 'moules', (SELECT Id FROM IngredientCategories WHERE Slug='poissons-fruits-mer')),
-- Légumineuses
('Lentilles', 'lentilles', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses')),
('Lentilles corail', 'lentilles-corail', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses')),
('Pois chiches', 'pois-chiches', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses')),
('Haricots rouges', 'haricots-rouges', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses')),
('Haricots blancs', 'haricots-blancs', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses')),
('Tofu', 'tofu', (SELECT Id FROM IngredientCategories WHERE Slug='legumineuses'))
ON DUPLICATE KEY UPDATE
  Name = VALUES(Name),
  CategoryId = VALUES(CategoryId);

-- ---------- Recipe Categories ----------
INSERT INTO RecipeCategories (Name, Slug) VALUES
('Entrée', 'entree'),
('Plat principal', 'plat-principal'),
('Dessert', 'dessert'),
('Apéritif', 'aperitif'),
('Petit-déjeuner', 'petit-dejeuner')
ON DUPLICATE KEY UPDATE Name = VALUES(Name);

-- ---------- Tags ----------
INSERT INTO Tags (Name, Slug) VALUES
('Végétarien', 'vegetarien'),
('Vegan', 'vegan'),
('Sans gluten', 'sans-gluten'),
('Sans lactose', 'sans-lactose'),
('Sans sucre ajouté', 'sans-sucre-ajoute'),
('Cétogène', 'cetogene'),
('Rapide', 'rapide'),
('Très rapide', 'tres-rapide'),
('Facile', 'facile'),
('Intermédiaire', 'intermediaire'),
('Difficile', 'difficile'),
('Healthy', 'healthy'),
('Light', 'light'),
('Protéiné', 'proteine'),
('Comfort food', 'comfort-food'),
('Cuisine française', 'cuisine-francaise'),
('Cuisine italienne', 'cuisine-italienne'),
('Cuisine asiatique', 'cuisine-asiatique'),
('Cuisine mexicaine', 'cuisine-mexicaine'),
('Cuisine orientale', 'cuisine-orientale'),
('Cuisine méditerranéenne', 'cuisine-mediterraneenne'),
('Anniversaire', 'anniversaire'),
('Noël', 'noel'),
('Barbecue', 'barbecue'),
('Brunch', 'brunch'),
('Batch cooking', 'batch-cooking')
ON DUPLICATE KEY UPDATE Name = VALUES(Name);

-- ---------- Equipments ----------
INSERT INTO Equipments (Name, Slug) VALUES
('Casserole', 'casserole'),
('Poêle', 'poele'),
('Four', 'four'),
('Plaque de cuisson', 'plaque-cuisson'),
('Saladier', 'saladier'),
('Fouet', 'fouet'),
('Spatule', 'spatule'),
('Couteau', 'couteau'),
('Planche à découper', 'planche-decouper'),
('Mixeur', 'mixeur')
ON DUPLICATE KEY UPDATE Name = VALUES(Name);

COMMIT;