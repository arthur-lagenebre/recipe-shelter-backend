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
INSERT INTO Users (Mail, Username, Password, RoleId, Status, EmailValidatedAt)
VALUES (
  'admin@recipe-shelter.fr',
  'admin',
  '$2b$12$zrX5iMCRel.f0GtuWfc2J.w8rq7bSuNnFnpd6.ODVPEGhgZlygfBW',
  (SELECT Id FROM Roles WHERE Name = 'admin'),
  'active',
  CURRENT_TIMESTAMP
)
ON DUPLICATE KEY UPDATE
  Username = VALUES(Username),
  Password = VALUES(Password),
  RoleId = VALUES(RoleId),
  Status = VALUES(Status),
  EmailValidatedAt = COALESCE(EmailValidatedAt, VALUES(EmailValidatedAt));


-- ---------- Ingredients (base) ----------
INSERT INTO Ingredients (Name, Slug) VALUES
('Ail', 'ail'),
('Aubergines', 'aubergines'),
('Avocat', 'avocat'),
('Bacon', 'bacon'),
('Bananes', 'bananes'),
('Basilic', 'basilic'),
('Beurre demi-sel', 'beurre-demi-sel'),
('Beurre doux', 'beurre-doux'),
('Bicarbonate de soude', 'bicarbonate-soude'),
('Blanc de poulet', 'blanc-de-poulet'),
('Boeuf haché', 'boeuf-hache'),
('Boeuf', 'boeuf'),
('Brocoli', 'brocoli'),
('Cabillaud', 'cabillaud'),
('Cacao en poudre', 'cacao-poudre'),
('Cannelle', 'cannelle'),
('Carottes', 'carottes'),
('Champignons', 'champignons'),
('Cheddar', 'cheddar'),
('Chocolat au lait', 'chocolat-lait'),
('Chocolat blanc', 'chocolat-blanc'),
('Chocolat noir', 'chocolat-noir'),
('Chorizo', 'chorizo'),
('Chou-fleur', 'chou-fleur'),
('Citrons verts', 'citrons-verts'),
('Citrons', 'citrons'),
('Comté', 'comte'),
('Concentré de tomate', 'concentre-tomate'),
('Concombre', 'concombre'),
('Coriandre', 'coriandre'),
('Courgettes', 'courgettes'),
('Couscous', 'couscous'),
('Crevettes', 'crevettes'),
('Crème fraîche', 'creme-fraiche'),
('Crème liquide', 'creme-liquide'),
('Cumin', 'cumin'),
('Curcuma', 'curcuma'),
('Curry', 'curry'),
('Céleri', 'celeri'),
('Emmental', 'emmental'),
('Farine', 'farine'),
('Feta', 'feta'),
('Fraises', 'fraises'),
('Framboises', 'framboises'),
('Fromage blanc', 'fromage-blanc'),
('Fromage de chèvre', 'fromage-chevre'),
('Gruyère', 'gruyere'),
('Haricots blancs', 'haricots-blancs'),
('Haricots rouges', 'haricots-rouges'),
('Haricots verts', 'haricots-verts'),
('Herbes de Provence', 'herbes-provence'),
('Huile d''olive', 'huile-olive'),
('Huile de tournesol', 'huile-tournesol'),
('Jambon', 'jambon'),
('Ketchup', 'ketchup'),
('Lait', 'lait'),
('Lardons', 'lardons'),
('Laurier', 'laurier'),
('Lentilles corail', 'lentilles-corail'),
('Lentilles', 'lentilles'),
('Levure boulangère', 'levure-boulangere'),
('Levure chimique', 'levure-chimique'),
('Mascarpone', 'mascarpone'),
('Mayonnaise', 'mayonnaise'),
('Maïs', 'mais'),
('Maïzena', 'maizena'),
('Miel', 'miel'),
('Moules', 'moules'),
('Moutarde à l''ancienne', 'moutarde-ancienne'),
('Moutarde', 'moutarde'),
('Mozzarella', 'mozzarella'),
('Myrtilles', 'myrtilles'),
('Oeufs', 'oeufs'),
('Oignons rouges', 'oignons-rouges'),
('Oignons', 'oignons'),
('Oranges', 'oranges'),
('Pain', 'pain'),
('Paprika', 'paprika'),
('Parmesan', 'parmesan'),
('Patates douces', 'patates-douces'),
('Persil', 'persil'),
('Pesto', 'pesto'),
('Piment', 'piment'),
('Poireaux', 'poireaux'),
('Pois chiches', 'pois-chiches'),
('Poivre blanc', 'poivre-blanc'),
('Poivre noir', 'poivre-noir'),
('Poivrons', 'poivrons'),
('Pommes de terre', 'pommes-de-terre'),
('Pommes', 'pommes'),
('Porc', 'porc'),
('Poulet', 'poulet'),
('Pâtes', 'pates'),
('Quinoa', 'quinoa'),
('Ricotta', 'ricotta'),
('Riz basmati', 'riz-basmati'),
('Riz', 'riz'),
('Romarin', 'romarin'),
('Roquette', 'roquette'),
('Salade', 'salade'),
('Sauce soja', 'sauce-soja'),
('Sauce Worcestershire', 'sauce-worcestershire'),
('Saucisses', 'saucisses'),
('Saumon', 'saumon'),
('Sel', 'sel'),
('Semoule', 'semoule'),
('Sucre glace', 'sucre-glace'),
('Sucre roux', 'sucre-roux'),
('Sucre', 'sucre'),
('Thon', 'thon'),
('Thym', 'thym'),
('Tofu', 'tofu'),
('Tomates cerises', 'tomates-cerises'),
('Tomates', 'tomates'),
('Vanille', 'vanille'),
('Vinaigre balsamique', 'vinaigre-balsamique'),
('Vinaigre de cidre', 'vinaigre-cidre'),
('Yaourt nature', 'yaourt-nature'),
('Échalotes', 'echalotes'),
('Épinards', 'epinards')
ON DUPLICATE KEY UPDATE
  Name = VALUES(Name);

-- ---------- Recipe Categories ----------
INSERT INTO RecipeCategories (Name, Slug, IconName) VALUES
('Apéritif', 'aperitif', 'snack'),
('Boissons', 'boissons', 'glass'),
('Dessert', 'dessert', 'cake'),
('Entrée', 'entree', 'salad'),
('Petit-déjeuner', 'petit-dejeuner', 'croissant'),
('Plat principal', 'plat-principal', 'dish')
ON DUPLICATE KEY UPDATE
  Name = VALUES(Name),
  IconName = VALUES(IconName);

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
