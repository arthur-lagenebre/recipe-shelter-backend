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


-- ---------- Ingredients (base) ----------
INSERT INTO Ingredients (Name, Slug) VALUES
-- Épices & herbes
('Sel', 'sel'),
('Poivre noir', 'poivre-noir'),
('Poivre blanc', 'poivre-blanc'),
('Paprika', 'paprika'),
('Cumin', 'cumin'),
('Curry', 'curry'),
('Curcuma', 'curcuma'),
('Piment', 'piment'),
('Herbes de Provence', 'herbes-provence'),
('Basilic', 'basilic'),
('Persil', 'persil'),
('Coriandre', 'coriandre'),
('Thym', 'thym'),
('Romarin', 'romarin'),
('Laurier', 'laurier'),
-- Pâtisserie
('Sucre', 'sucre'),
('Sucre roux', 'sucre-roux'),
('Sucre glace', 'sucre-glace'),
('Miel', 'miel'),
('Farine', 'farine'),
('Maïzena', 'maizena'),
('Levure chimique', 'levure-chimique'),
('Levure boulangère', 'levure-boulangere'),
('Bicarbonate de soude', 'bicarbonate-soude'),
('Cacao en poudre', 'cacao-poudre'),
('Chocolat noir', 'chocolat-noir'),
('Chocolat au lait', 'chocolat-lait'),
('Chocolat blanc', 'chocolat-blanc'),
('Vanille', 'vanille'),
('Cannelle', 'cannelle'),
-- Huiles & condiments
('Huile d''olive', 'huile-olive'),
('Huile de tournesol', 'huile-tournesol'),
('Vinaigre balsamique', 'vinaigre-balsamique'),
('Vinaigre de cidre', 'vinaigre-cidre'),
('Moutarde', 'moutarde'),
('Moutarde à l''ancienne', 'moutarde-ancienne'),
('Sauce soja', 'sauce-soja'),
('Sauce Worcestershire', 'sauce-worcestershire'),
('Ketchup', 'ketchup'),
('Mayonnaise', 'mayonnaise'),
('Pesto', 'pesto'),
-- Produits laitiers
('Lait', 'lait'),
('Crème fraîche', 'creme-fraiche'),
('Crème liquide', 'creme-liquide'),
('Beurre doux', 'beurre-doux'),
('Beurre demi-sel', 'beurre-demi-sel'),
('Yaourt nature', 'yaourt-nature'),
('Fromage blanc', 'fromage-blanc'),
('Mascarpone', 'mascarpone'),
('Mozzarella', 'mozzarella'),
('Parmesan', 'parmesan'),
('Emmental', 'emmental'),
('Comté', 'comte'),
('Gruyère', 'gruyere'),
('Cheddar', 'cheddar'),
('Feta', 'feta'),
('Fromage de chèvre', 'fromage-chevre'),
('Ricotta', 'ricotta'),
('Oeufs', 'oeufs'),
-- Céréales & féculents
('Riz', 'riz'),
('Riz basmati', 'riz-basmati'),
('Pâtes', 'pates'),
('Semoule', 'semoule'),
('Couscous', 'couscous'),
('Quinoa', 'quinoa'),
('Pommes de terre', 'pommes-de-terre'),
('Patates douces', 'patates-douces'),
('Pain', 'pain'),
-- Légumes
('Tomates', 'tomates'),
('Tomates cerises', 'tomates-cerises'),
('Concentré de tomate', 'concentre-tomate'),
('Oignons', 'oignons'),
('Oignons rouges', 'oignons-rouges'),
('Ail', 'ail'),
('Échalotes', 'echalotes'),
('Carottes', 'carottes'),
('Courgettes', 'courgettes'),
('Aubergines', 'aubergines'),
('Poivrons', 'poivrons'),
('Concombre', 'concombre'),
('Salade', 'salade'),
('Roquette', 'roquette'),
('Épinards', 'epinards'),
('Champignons', 'champignons'),
('Brocoli', 'brocoli'),
('Chou-fleur', 'chou-fleur'),
('Haricots verts', 'haricots-verts'),
('Maïs', 'mais'),
('Avocat', 'avocat'),
('Poireaux', 'poireaux'),
('Céleri', 'celeri'),
-- Fruits
('Pommes', 'pommes'),
('Bananes', 'bananes'),
('Fraises', 'fraises'),
('Framboises', 'framboises'),
('Myrtilles', 'myrtilles'),
('Oranges', 'oranges'),
('Citrons', 'citrons'),
('Citrons verts', 'citrons-verts'),
-- Viandes
('Poulet', 'poulet'),
('Blanc de poulet', 'blanc-de-poulet'),
('Boeuf', 'boeuf'),
('Boeuf haché', 'boeuf-hache'),
('Porc', 'porc'),
('Lardons', 'lardons'),
('Jambon', 'jambon'),
('Bacon', 'bacon'),
('Saucisses', 'saucisses'),
('Chorizo', 'chorizo'),
-- Poissons & fruits de mer
('Saumon', 'saumon'),
('Thon', 'thon'),
('Cabillaud', 'cabillaud'),
('Crevettes', 'crevettes'),
('Moules', 'moules'),
-- Légumineuses
('Lentilles', 'lentilles'),
('Lentilles corail', 'lentilles-corail'),
('Pois chiches', 'pois-chiches'),
('Haricots rouges', 'haricots-rouges'),
('Haricots blancs', 'haricots-blancs'),
('Tofu', 'tofu')
ON DUPLICATE KEY UPDATE
  Name = VALUES(Name);

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
