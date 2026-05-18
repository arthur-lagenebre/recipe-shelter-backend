USE recipe_shelter;

SET NAMES utf8mb4;

START TRANSACTION;

-- =====================================================
-- USERS DE DEMO
-- Passwords: tous = "Password123!" (bcrypt $2b$12$...)
-- =====================================================

INSERT INTO Users (Id, Mail, Username, Password, RoleId, Status, EmailValidatedAt) VALUES
-- Utilisateurs actifs
(3,  'marie.dupont@gmail.com',    'MarieDupont',   '$2b$12$eImiTXuWVxfM37uY4JANjOe0aF0YoZz3wGGBF1sGMXzK3rRkJkB6K', 2, 'active', '2024-09-15 10:23:00'),
(4,  'thomas.martin@hotmail.fr',  'ThomasMartin',  '$2b$12$eImiTXuWVxfM37uY4JANjOe0aF0YoZz3wGGBF1sGMXzK3rRkJkB6K', 2, 'active', '2024-10-02 14:45:00'),
(5,  'sophie.leclerc@yahoo.fr',   'SophieCuisine', '$2b$12$eImiTXuWVxfM37uY4JANjOe0aF0YoZz3wGGBF1sGMXzK3rRkJkB6K', 2, 'active', '2024-11-20 09:10:00'),
-- Utilisateur en attente de validation
(6,  'paul.bernard@gmail.com',    'PaulB',         '$2b$12$eImiTXuWVxfM37uY4JANjOe0aF0YoZz3wGGBF1sGMXzK3rRkJkB6K', 2, 'inactive', NULL),
-- Utilisateur banni
(7,  'spammer42@outlook.com',     'SpammerDu42',   '$2b$12$eImiTXuWVxfM37uY4JANjOe0aF0YoZz3wGGBF1sGMXzK3rRkJkB6K', 2, 'banned', '2024-08-01 00:00:00')
AS new_users
ON DUPLICATE KEY UPDATE
  Username = new_users.Username,
  Status   = new_users.Status;

-- Mise à jour du ban (après insertion pour éviter la FK circulaire)
UPDATE Users SET
  BannedByUserId = 1,
  BannedReason   = 'Spam de liens commerciaux répétés',
  BannedAt       = '2025-01-10 11:00:00'
WHERE Id = 7;

-- Historique de modération du compte banni
INSERT INTO UserModerationLogs (Id, UserId, AdminId, Action, Reason, CreatedAt) VALUES
(1, 7, 1, 'ban',   'Publication répétée de liens promotionnels dans les commentaires', '2024-12-12 09:30:00'),
(2, 7, 1, 'unban', 'Compte réactivé après engagement à respecter les règles de la communauté', '2024-12-18 15:45:00'),
(3, 7, 1, 'ban',   'Spam de liens commerciaux répétés', '2025-01-10 11:00:00')
AS new_user_moderation_logs
ON DUPLICATE KEY UPDATE
  UserId    = new_user_moderation_logs.UserId,
  AdminId   = new_user_moderation_logs.AdminId,
  Action    = new_user_moderation_logs.Action,
  Reason    = new_user_moderation_logs.Reason,
  CreatedAt = new_user_moderation_logs.CreatedAt;


-- =====================================================
-- RECETTES (20 publiées)
-- UserId répartis entre 1 (admin), 3, 4, 5
-- =====================================================

INSERT INTO Recipes
  (Id, UserId, CategoryId, Title, Slug, Description, RecipeCoverImage, PrepTimeMinutes, RestTimeMinutes, CookTimeMinutes, Servings, Status, SubmittedAt, ModeratedAt, ModeratedByUserId, PublishedAt)
VALUES
-- 1. Feuilletés apéritif chorizo feta
(1, 3, 1, 'Feuilletés apéritif chorizo feta',
 'feuilletes-aperitif-chorizo-feta',
 'Des petits feuilletés croustillants garnis de chorizo et de feta, parfaits pour l''apéritif. Rapides à préparer et irrésistibles, ils disparaissent en quelques minutes !',
 'https://placehold.co/1200x800/f97316/111827?text=Feuilletes+chorizo+feta',
 15, NULL, 20, 6, 'published', '2024-10-05 18:00:00', '2024-10-06 09:00:00', 1, '2024-10-06 09:30:00'),

-- 2. Poulet au coco et curry
(2, 3, 6, 'Poulet au coco et curry',
 'poulet-au-coco-et-curry',
 'Un plat parfumé et crémeux qui mêle la douceur du lait de coco à la chaleur du curry. Un voyage savoureux en une seule casserole.',
 'https://placehold.co/1200x800/fbbf24/111827?text=Poulet+coco+curry',
 15, NULL, 30, 4, 'published', '2024-10-10 12:00:00', '2024-10-11 08:00:00', 1, '2024-10-11 08:30:00'),

-- 3. Soupe d'asperges blanches
(3, 4, 4, 'Soupe d''asperges blanches',
 'soupe-asperges-blanches',
 'Une soupe veloutée et délicate à base d''asperges blanches fraîches, légèrement crémée. Idéale en entrée pour un repas printanier.',
 'https://placehold.co/1200x800/a7f3d0/064e3b?text=Soupe+asperges+blanches',
 20, NULL, 25, 4, 'published', '2024-10-15 11:00:00', '2024-10-16 09:00:00', 1, '2024-10-16 09:30:00'),

-- 4. Tarte chocolat orange
(4, 5, 3, 'Tarte chocolat orange',
 'tarte-chocolat-orange',
 'Une tarte gourmande alliant l''intensité du chocolat noir à la fraîcheur de l''orange. Un dessert élégant qui épatera vos convives.',
 'https://placehold.co/1200x800/7f1d1d/fef3c7?text=Tarte+chocolat+orange',
 30, 60, 15, 8, 'published', '2024-10-20 16:00:00', '2024-10-21 10:00:00', 1, '2024-10-21 10:30:00'),

-- 5. Omelette norvégienne facile
(5, 5, 3, 'Omelette norvégienne facile',
 'omelette-norvegienne-facile',
 'Le grand classique des desserts festifs : une génoise, une glace et une meringue flambée. Plus simple qu''il n''y paraît !',
 'https://placehold.co/1200x800/f9a8d4/831843?text=Omelette+norvegienne',
 40, 120, 10, 8, 'published', '2024-10-25 14:00:00', '2024-10-26 09:00:00', 1, '2024-10-26 09:30:00'),

-- 6. Figues confites au vin rouge
(6, 4, 3, 'Figues confites au vin rouge',
 'figues-confites-au-vin-rouge',
 'Des figues fondantes pochées dans un vin rouge épicé au miel et aux aromates. Un dessert ou un accompagnement de fromages raffiné.',
 'https://placehold.co/1200x800/581c87/fdf4ff?text=Figues+vin+rouge',
 10, NULL, 40, 4, 'published', '2024-11-01 10:00:00', '2024-11-02 09:00:00', 1, '2024-11-02 09:30:00'),

-- 7. Tataki de thon
(7, 3, 4, 'Tataki de thon',
 'tataki-de-thon',
 'Une entrée japonaise sophistiquée : le thon est saisi quelques secondes, tranché fin et servi avec une sauce soja citronnée au gingembre.',
 'https://placehold.co/1200x800/0f766e/ecfeff?text=Tataki+de+thon',
 15, 30, 5, 4, 'published', '2024-11-05 12:00:00', '2024-11-06 09:00:00', 1, '2024-11-06 09:30:00'),

-- 8. Œufs mollet de grand-mère
(8, 5, 4, 'Œufs mollet de grand-mère',
 'oeufs-mollet-grand-mere',
 'Des œufs mollets servis sur une sauce aux champignons et lardons, sur toast. Un plat de bistrot réconfortant et plein de saveurs.',
 'https://placehold.co/1200x800/fde68a/713f12?text=Oeufs+mollet+grand-mere',
 10, NULL, 15, 2, 'published', '2024-11-10 11:00:00', '2024-11-11 09:00:00', 1, '2024-11-11 09:30:00'),

-- 9. Soupe aux 7 légumes
(9, 4, 4, 'Soupe aux 7 légumes',
 'soupe-aux-7-legumes',
 'Une soupe nourrissante et colorée qui réunit sept légumes de saison. Simple, économique et délicieuse, elle réchauffe les longues soirées d''hiver.',
 'https://placehold.co/1200x800/86efac/14532d?text=Soupe+aux+7+legumes',
 20, NULL, 35, 6, 'published', '2024-11-15 10:00:00', '2024-11-16 09:00:00', 1, '2024-11-16 09:30:00'),

-- 10. Soupe au chou vert
(10, 3, 4, 'Soupe au chou vert',
 'soupe-au-chou-vert',
 'La soupe au chou traditionnelle, mijotée longuement avec de belles tranches de lard fumé. Un classique de la cuisine paysanne française.',
 'https://placehold.co/1200x800/4ade80/052e16?text=Soupe+au+chou+vert',
 15, NULL, 60, 6, 'published', '2024-11-20 11:00:00', '2024-11-21 09:00:00', 1, '2024-11-21 09:30:00'),

-- 11. Croissants pesto jambon
(11, 5, 1, 'Croissants pesto jambon',
 'croissants-pesto-jambon',
 'Des croissants feuilletés garnis d''une généreuse couche de pesto et de jambon. Parfaits pour un apéritif dînatoire ou un brunch gourmand.',
 'https://placehold.co/1200x800/b45309/fff7ed?text=Croissants+pesto+jambon',
 15, NULL, 20, 8, 'published', '2024-11-25 14:00:00', '2024-11-26 09:00:00', 1, '2024-11-26 09:30:00'),

-- 12. Galette des rois salée façon couronne
(12, 4, 1, 'Galette des rois salée façon couronne',
 'galette-des-rois-salee-facon-couronne',
 'Une couronne feuilletée salée garnie de fromage de chèvre, épinards et noix. Une belle alternative à la galette sucrée pour l''Épiphanie.',
 'https://placehold.co/1200x800/c084fc/3b0764?text=Galette+salee+couronne',
 20, NULL, 25, 6, 'published', '2024-12-01 10:00:00', '2024-12-02 09:00:00', 1, '2024-12-02 09:30:00'),

-- 13. Punch délicieux
(13, 3, 2, 'Punch délicieux',
 'punch-delicieux',
 'Un punch fruité et généreux au rhum, aux jus de fruits exotiques et au sirop de grenadine. La boisson festive par excellence pour vos soirées.',
 'https://placehold.co/1200x800/f43f5e/fff1f2?text=Punch+delicieux',
 10, 60, NULL, 10, 'published', '2024-12-05 12:00:00', '2024-12-06 09:00:00', 1, '2024-12-06 09:30:00'),

-- 14. Gambas à l'armoricaine
(14, 5, 6, 'Gambas à l''armoricaine',
 'gambas-a-l-armoricaine',
 'Des gambas flambées au cognac et cuisinées dans une sauce tomate onctueuse à la crème fraîche. Un plat de fête aux saveurs marines inoubliables.',
 'https://placehold.co/1200x800/f87171/450a0a?text=Gambas+armoricaine',
 20, NULL, 25, 4, 'published', '2024-12-10 11:00:00', '2024-12-11 09:00:00', 1, '2024-12-11 09:30:00'),

-- 15. La gâche vendéenne du petit-déjeuner
(15, 4, 5, 'La gâche vendéenne du petit-déjeuner',
 'gache-vendeenne-petit-dejeuner',
 'La brioche vendéenne traditionnelle, légèrement parfumée à la fleur d''oranger. Moelleuse à souhait, elle est irrésistible au petit-déjeuner.',
 'https://placehold.co/1200x800/facc15/422006?text=Gache+vendeenne',
 30, 120, 35, 10, 'published', '2024-12-15 09:00:00', '2024-12-16 09:00:00', 1, '2024-12-16 09:30:00'),

-- 16. Egg McMuffin maison
(16, 3, 5, 'Egg McMuffin maison',
 'egg-mcmuffin-maison',
 'Le célèbre sandwich du petit-déjeuner américain, fait maison avec un muffin anglais, un œuf poché, du bacon et du cheddar fondu.',
 'https://placehold.co/1200x800/f59e0b/431407?text=Egg+McMuffin+maison',
 10, NULL, 10, 2, 'published', '2024-12-20 08:00:00', '2024-12-21 09:00:00', 1, '2024-12-21 09:30:00'),

-- 17. Omelette aux pruneaux du petit-déjeuner
(17, 5, 5, 'Omelette aux pruneaux du petit-déjeuner',
 'omelette-aux-pruneaux-petit-dejeuner',
 'Une omelette sucrée et originale garnie de pruneaux moelleux et d''une pointe de cannelle. Un petit-déjeuner doux et nourrissant.',
 'https://placehold.co/1200x800/a16207/fefce8?text=Omelette+aux+pruneaux',
 5, NULL, 10, 2, 'published', '2025-01-05 08:00:00', '2025-01-06 09:00:00', 1, '2025-01-06 09:30:00'),

-- 18. Cocktail à l'ouzo (Grèce)
(18, 4, 2, 'Cocktail à l''ouzo',
 'cocktail-a-l-ouzo',
 'Un cocktail frais et anisé inspiré de la Grèce, mêlant l''ouzo au jus de citron vert, au sirop de miel et à l''eau pétillante.',
 'https://placehold.co/1200x800/38bdf8/082f49?text=Cocktail+a+l-ouzo',
 5, NULL, NULL, 2, 'published', '2025-01-10 15:00:00', '2025-01-11 09:00:00', 1, '2025-01-11 09:30:00'),

-- 19. Mojito à la bière
(19, 3, 2, 'Mojito à la bière',
 'mojito-a-la-biere',
 'Une version festive et originale du mojito classique : la bière blonde remplace le soda pour une boisson désaltérante et légèrement amère.',
 'https://placehold.co/1200x800/22c55e/052e16?text=Mojito+a+la+biere',
 10, NULL, NULL, 4, 'published', '2025-01-15 16:00:00', '2025-01-16 09:00:00', 1, '2025-01-16 09:30:00'),

-- 20. Le vrai chocolat chaud maison
(20, 5, 2, 'Le vrai chocolat chaud maison',
 'le-vrai-chocolat-chaud-maison',
 'Un chocolat chaud épais et velouté, préparé avec du vrai chocolat noir de qualité. Bien loin des poudres industrielles, c''est la perfection dans une tasse.',
 'https://placehold.co/1200x800/78350f/fef3c7?text=Chocolat+chaud+maison',
 5, NULL, 10, 2, 'published', '2025-01-20 17:00:00', '2025-01-21 09:00:00', 1, '2025-01-21 09:30:00')

AS new_recipes
ON DUPLICATE KEY UPDATE
  Title = new_recipes.Title,
  RecipeCoverImage = new_recipes.RecipeCoverImage;


-- =====================================================
-- RECIPE STEPS
-- =====================================================

INSERT INTO RecipeSteps (RecipeId, StepNumber, Description) VALUES
-- 1. Feuilletés chorizo feta
(1, 1, 'Préchauffez le four à 200°C. Déroulez la pâte feuilletée sur le plan de travail.'),
(1, 2, 'Coupez le chorizo en fines rondelles et émiettez la feta.'),
(1, 3, 'Répartissez le chorizo et la feta sur la pâte. Roulez en boudin et découpez en tronçons de 2 cm.'),
(1, 4, 'Disposez sur une plaque recouverte de papier cuisson. Dorez à l''œuf battu.'),
(1, 5, 'Enfournez 18-20 min jusqu''à ce qu''ils soient bien dorés. Servez chaud.'),

-- 2. Poulet coco curry
(2, 1, 'Coupez le poulet en morceaux. Émincez l''oignon et l''ail.'),
(2, 2, 'Faites revenir l''oignon et l''ail dans l''huile d''olive jusqu''à coloration.'),
(2, 3, 'Ajoutez le poulet, saisissez-le sur toutes les faces. Saupoudrez de curry.'),
(2, 4, 'Versez le lait de coco et le bouillon. Salez, poivrez. Laissez mijoter 25 min à feu doux.'),
(2, 5, 'Ajustez l''assaisonnement et servez avec du riz basmati et de la coriandre fraîche.'),

-- 3. Soupe asperges blanches
(3, 1, 'Pelez les asperges et coupez les pointes. Réservez les pointes et coupez les tiges en tronçons.'),
(3, 2, 'Faites suer l''oignon émincé dans le beurre. Ajoutez les tiges d''asperges.'),
(3, 3, 'Couvrez de bouillon, salez et laissez cuire 20 min. Mixez finement.'),
(3, 4, 'Incorporez la crème liquide, rectifiez l''assaisonnement.'),
(3, 5, 'Faites sauter les pointes dans le beurre 3 min. Servez la soupe avec les pointes et du persil.'),

-- 4. Tarte chocolat orange
(4, 1, 'Préparez la pâte sucrée : mélangez farine, beurre, sucre, oeuf. Formez une boule, réfrigérez 30 min.'),
(4, 2, 'Étalez la pâte, foncez le moule. Faites cuire à blanc 15 min à 180°C.'),
(4, 3, 'Faites fondre le chocolat noir au bain-marie avec la crème liquide.'),
(4, 4, 'Ajoutez le zeste et le jus d''une orange, une noix de beurre. Mélangez jusqu''à ganache lisse.'),
(4, 5, 'Versez la ganache dans le fond de tarte. Réfrigérez 1h. Décorez de zestes d''orange confits.'),

-- 5. Omelette norvégienne
(5, 1, 'Préparez la génoise et faites-la cuire 20 min à 180°C. Laissez refroidir.'),
(5, 2, 'Coupez la génoise en deux. Garnissez avec la glace vanille. Remettez au congélateur 2h.'),
(5, 3, 'Montez les blancs en neige ferme avec le sucre pour faire la meringue.'),
(5, 4, 'Recouvrez entièrement le gâteau de meringue à la spatule ou à la poche.'),
(5, 5, 'Au moment de servir, flambez avec du rhum chauffé. Servez immédiatement.'),

-- 6. Figues confites au vin rouge
(6, 1, 'Lavez les figues. Dans une casserole, versez le vin rouge, le miel, la cannelle et la badiane.'),
(6, 2, 'Portez à ébullition, ajoutez les figues entières.'),
(6, 3, 'Laissez frémir 35-40 min jusqu''à ce que les figues soient fondantes et le sirop épais.'),
(6, 4, 'Laissez refroidir. Servez tiède ou froid avec du fromage de chèvre frais ou de la crème fouettée.'),

-- 7. Tataki de thon
(7, 1, 'Mélangez sauce soja, gingembre râpé, jus de citron vert, huile de sésame. Réservez la moitié.'),
(7, 2, 'Faites mariner le pavé de thon 20 min dans la moitié de la sauce.'),
(7, 3, 'Faites chauffer une poêle à feu très vif. Saisissez le thon 30 secondes par face.'),
(7, 4, 'Tranchez finement le thon. Disposez sur assiette avec les graines de sésame.'),
(7, 5, 'Arrosez de la sauce restante. Décorez de coriandre fraîche et de citron vert.'),

-- 8. Œufs mollet grand-mère
(8, 1, 'Faites cuire les œufs 6 min dans l''eau bouillante salée. Plongez dans l''eau froide, écalez délicatement.'),
(8, 2, 'Faites revenir les lardons à sec. Ajoutez les champignons émincés, faites sauter 5 min.'),
(8, 3, 'Déglacez avec un filet de vin blanc. Ajoutez la crème fraîche, salez, poivrez.'),
(8, 4, 'Faites dorer les tranches de pain. Posez les œufs mollets dessus.'),
(8, 5, 'Nappez de sauce aux champignons et lardons. Parsemez de persil haché.'),

-- 9. Soupe 7 légumes
(9, 1, 'Épluchez et coupez en dés : carottes, pommes de terre, poireaux, navet, courgette, céleri, tomates.'),
(9, 2, 'Faites revenir l''oignon et l''ail dans l''huile d''olive.'),
(9, 3, 'Ajoutez tous les légumes, couvrez de bouillon. Portez à ébullition.'),
(9, 4, 'Laissez mijoter 30 min. Ajoutez le bouquet garni (thym, laurier, persil).'),
(9, 5, 'Salez, poivrez. Mixez partiellement ou laissez en morceaux selon votre goût.'),

-- 10. Soupe chou vert
(10, 1, 'Lavez et découpez le chou vert en lanières. Coupez le lard en morceaux.'),
(10, 2, 'Faites revenir le lard dans une marmite. Ajoutez l''oignon émincé.'),
(10, 3, 'Ajoutez le chou, les pommes de terre coupées en dés, le bouillon. Portez à ébullition.'),
(10, 4, 'Ajoutez thym, laurier. Laissez mijoter 50-60 min à feu doux.'),
(10, 5, 'Rectifiez l''assaisonnement. Servez bien chaud avec du pain de campagne.'),

-- 11. Croissants pesto jambon
(11, 1, 'Préchauffez le four à 190°C. Déroulez la pâte feuilletée et découpez des triangles.'),
(11, 2, 'Étalez une cuillère de pesto sur chaque triangle. Disposez une tranche de jambon.'),
(11, 3, 'Roulez les croissants en partant de la base vers la pointe.'),
(11, 4, 'Disposez sur une plaque, dorez au jaune d''œuf.'),
(11, 5, 'Enfournez 18-20 min jusqu''à dorure. Servez tiède.'),

-- 12. Galette des rois salée
(12, 1, 'Faites revenir les épinards à la poêle avec ail et huile d''olive. Égouttez bien.'),
(12, 2, 'Mélangez fromage de chèvre émietté, épinards, noix concassées, sel, poivre.'),
(12, 3, 'Étalez une pâte feuilletée, déposez la farce en couronne. Recouvrez de la seconde pâte.'),
(12, 4, 'Soudez les bords, dorez à l''œuf et faites des entailles décoratives. N''oubliez pas la fève !'),
(12, 5, 'Enfournez 25 min à 200°C jusqu''à belle coloration dorée.'),

-- 13. Punch délicieux
(13, 1, 'Mélangez dans un grand saladier : jus d''ananas, jus d''orange, jus de citron vert.'),
(13, 2, 'Ajoutez le sirop de grenadine et le rhum blanc. Mélangez bien.'),
(13, 3, 'Ajoutez de la glace pilée et complétez avec de l''eau pétillante.'),
(13, 4, 'Décorez de rondelles de citron vert et de feuilles de menthe. Servez très frais.'),

-- 14. Gambas à l'armoricaine
(14, 1, 'Décortiquez les gambas en gardant la queue. Faites chauffer le beurre et l''huile dans une sauteuse.'),
(14, 2, 'Saisissez les gambas 1 min par face. Flambez au cognac.'),
(14, 3, 'Faites suer l''échalote et l''ail. Ajoutez le concentré de tomate, le vin blanc.'),
(14, 4, 'Ajoutez la crème fraîche, le thym, le laurier. Laissez réduire 10 min.'),
(14, 5, 'Remettez les gambas dans la sauce 2 min. Servez parsemé de persil et accompagné de riz.'),

-- 15. Gâche vendéenne
(15, 1, 'Dans la cuve du robot, mélangez farine, sucre, sel, levure boulangère. Ajoutez œufs et beurre ramolli.'),
(15, 2, 'Pétrissez 10 min jusqu''à pâte lisse et élastique. Ajoutez la crème fraîche et la fleur d''oranger.'),
(15, 3, 'Laissez lever 1h30 à température ambiante sous un torchon.'),
(15, 4, 'Dégazez, façonnez en boule allongée. Laissez lever encore 30 min. Dorez à l''œuf.'),
(15, 5, 'Enfournez 30-35 min à 170°C. La gâche doit être bien dorée et sonner creux.'),

-- 16. Egg McMuffin
(16, 1, 'Faites cuire le bacon dans une poêle jusqu''à ce qu''il soit croustillant. Réservez.'),
(16, 2, 'Dans le même cercle à œuf, faites cuire l''œuf au plat dans la poêle. Salez, poivrez.'),
(16, 3, 'Coupez le muffin anglais en deux et faites-le dorer au grille-pain.'),
(16, 4, 'Assemblez : muffin, tranche de cheddar, bacon, œuf. Refermez avec l''autre moitié.'),
(16, 5, 'Servez immédiatement bien chaud.'),

-- 17. Omelette aux pruneaux
(17, 1, 'Dénoyautez et coupez les pruneaux en morceaux. Faites-les gonfler 10 min dans de l''eau chaude.'),
(17, 2, 'Battez les œufs avec le lait, une pincée de cannelle et de sucre. Salez légèrement.'),
(17, 3, 'Faites fondre le beurre dans une poêle à feu moyen. Versez le mélange œufs.'),
(17, 4, 'Répartissez les pruneaux égouttés sur l''omelette encore baveuse. Repliez.'),
(17, 5, 'Servez aussitôt avec un filet de miel et une pincée de cannelle.'),

-- 18. Cocktail ouzo
(18, 1, 'Dans un shaker, mettez la glace pilée, l''ouzo, le jus de citron vert et le sirop de miel.'),
(18, 2, 'Agitez vigoureusement 15 secondes.'),
(18, 3, 'Versez dans un verre. Complétez avec de l''eau pétillante très froide.'),
(18, 4, 'Décorez d''une rondelle de citron vert et d''une feuille de menthe. Servez immédiatement.'),

-- 19. Mojito à la bière
(19, 1, 'Lavez et séchez les feuilles de menthe. Coupez le citron vert en quartiers.'),
(19, 2, 'Dans un grand verre, écrasez la menthe et le citron vert avec le sucre de canne au pilon.'),
(19, 3, 'Ajoutez de la glace pilée et le rhum blanc.'),
(19, 4, 'Complétez avec la bière blonde bien froide. Mélangez délicatement. Décorez de menthe.'),

-- 20. Chocolat chaud maison
(20, 1, 'Hachez finement le chocolat noir et placez-le dans un bol.'),
(20, 2, 'Faites chauffer le lait à feu moyen sans le faire bouillir.'),
(20, 3, 'Versez un tiers du lait chaud sur le chocolat. Attendez 1 min puis mélangez en cercles depuis le centre.'),
(20, 4, 'Ajoutez le reste du lait progressivement, mélangez jusqu''à obtenir un chocolat lisse et brillant.'),
(20, 5, 'Versez dans des tasses préchauffées. Ajoutez une touche de chantilly si désiré.');


-- =====================================================
-- RECIPE INGREDIENTS (résolution par nom, pas par ID)
-- =====================================================

INSERT INTO RecipeIngredients (RecipeId, IngredientId, Quantity, Unit, Note, SortOrder) VALUES
-- 1. Feuilletés chorizo feta
(1, (SELECT Id FROM Ingredients WHERE Name = 'Farine'),  1,   NULL,   'pâte feuilletée rectangulaire', 1),
(1, (SELECT Id FROM Ingredients WHERE Name = 'Chorizo'), 150, 'g',    NULL,                             2),
(1, (SELECT Id FROM Ingredients WHERE Name = 'Feta'),    100, 'g',    NULL,                             3),
(1, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),    1,   NULL,   'pour la dorure',                 4),

-- 2. Poulet coco curry
(2, (SELECT Id FROM Ingredients WHERE Name = 'Poulet'),       800, 'g',    'escalopes ou hauts de cuisse', 1),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Oignon'),       1,   NULL,   NULL,                           2),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Ail'),          3,   NULL,   'gousses',                      3),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Lait de coco'), 400, 'ml',   'une boîte',                    4),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Curry'),        2,   'tbsp', NULL,                           5),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Huile d''olive'), 2, 'tbsp', NULL,                           6),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Coriandre'),    1,   NULL,   'bouquet',                      7),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Sel'),          1,   'tsp',  NULL,                           8),
(2, (SELECT Id FROM Ingredients WHERE Name = 'Poivre noir'),  1,   'pinch',NULL,                           9),

-- 3. Soupe asperges blanches
(3, (SELECT Id FROM Ingredients WHERE Name = 'Asperge'),       1000, 'g',  'asperges blanches fraîches', 1),
(3, (SELECT Id FROM Ingredients WHERE Name = 'Oignon'),        1,    NULL, NULL,                         2),
(3, (SELECT Id FROM Ingredients WHERE Name = 'Beurre'),        30,   'g',  NULL,                         3),
(3, (SELECT Id FROM Ingredients WHERE Name = 'Crème liquide'), 150,  'ml', NULL,                         4),
(3, (SELECT Id FROM Ingredients WHERE Name = 'Persil'),        1,    NULL, 'bouquet',                    5),
(3, (SELECT Id FROM Ingredients WHERE Name = 'Sel'),           1,    'tsp',NULL,                         6),

-- 4. Tarte chocolat orange
(4, (SELECT Id FROM Ingredients WHERE Name = 'Chocolat noir'), 200, 'g',  'chocolat noir 70%', 1),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Crème liquide'), 200, 'ml', NULL,                2),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Orange'),        2,   NULL, 'zeste + jus',       3),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Beurre'),        50,  'g',  NULL,                4),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Farine'),        200, 'g',  NULL,                5),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),         80,  'g',  NULL,                6),
(4, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),          2,   NULL, NULL,                7),

-- 5. Omelette norvégienne
(5, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),    4,   NULL, 'blancs seulement pour la meringue', 1),
(5, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),   200, 'g',  NULL,                               2),
(5, (SELECT Id FROM Ingredients WHERE Name = 'Farine'),  150, 'g',  NULL,                               3),
(5, (SELECT Id FROM Ingredients WHERE Name = 'Vanille'), 1,   NULL, 'gousse ou extrait',                4),
(5, (SELECT Id FROM Ingredients WHERE Name = 'Rhum'),    50,  'ml', 'pour le flambage',                 5),

-- 6. Figues confites au vin rouge
(6, (SELECT Id FROM Ingredients WHERE Name = 'Figue'),             12,  NULL,   'figues fraîches', 1),
(6, (SELECT Id FROM Ingredients WHERE Name = 'Miel'),              3,   'tbsp', NULL,              2),
(6, (SELECT Id FROM Ingredients WHERE Name = 'Cannelle'),          1,   NULL,   'bâton',           3),
(6, (SELECT Id FROM Ingredients WHERE Name = 'Fromage de chèvre'), 150, 'g',    'pour servir',     4),

-- 7. Tataki de thon
(7, (SELECT Id FROM Ingredients WHERE Name = 'Thon'),           400, 'g',    'pavé de thon rouge très frais', 1),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Sauce soja'),     4,   'tbsp', NULL,                            2),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Gingembre'),      20,  'g',    'frais râpé',                    3),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Citron vert'),    2,   NULL,   NULL,                            4),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Huile de sésame'),2,   'tbsp', NULL,                            5),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Sésame'),         2,   'tbsp', NULL,                            6),
(7, (SELECT Id FROM Ingredients WHERE Name = 'Coriandre'),      1,   NULL,   'bouquet',                       7),

-- 8. Œufs mollet grand-mère
(8, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),          4,   NULL, NULL,                   1),
(8, (SELECT Id FROM Ingredients WHERE Name = 'Lardons'),       150, 'g',  NULL,                   2),
(8, (SELECT Id FROM Ingredients WHERE Name = 'Champignon'),    200, 'g',  'champignons de Paris', 3),
(8, (SELECT Id FROM Ingredients WHERE Name = 'Crème fraîche'), 150, 'ml', NULL,                   4),
(8, (SELECT Id FROM Ingredients WHERE Name = 'Persil'),        1,   NULL, 'bouquet',               5),

-- 9. Soupe 7 légumes
(9, (SELECT Id FROM Ingredients WHERE Name = 'Carotte'),        3,  NULL,   NULL,       1),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Pomme de terre'), 3,  NULL,   NULL,       2),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Poireau'),        2,  NULL,   NULL,       3),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Navet'),          1,  NULL,   NULL,       4),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Courgette'),      2,  NULL,   NULL,       5),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Céleri'),         2,  NULL,   'branches', 6),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Tomate'),         3,  NULL,   NULL,       7),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Oignon'),         1,  NULL,   NULL,       8),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Ail'),            2,  NULL,   'gousses',  9),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Huile d''olive'), 2,  'tbsp', NULL,       10),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Thym'),           2,  NULL,   'brins',    11),
(9, (SELECT Id FROM Ingredients WHERE Name = 'Laurier'),        2,  NULL,   'feuilles', 12),

-- 10. Soupe chou vert
(10, (SELECT Id FROM Ingredients WHERE Name = 'Chou'),           1,   NULL,  'petit chou vert', 1),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Pomme de terre'), 4,   NULL,  NULL,              2),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Lardons'),        200, 'g',   'lardons fumés',   3),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Oignon'),         1,   NULL,  NULL,              4),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Laurier'),        2,   NULL,  'feuilles',        5),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Thym'),           2,   NULL,  'brins',           6),
(10, (SELECT Id FROM Ingredients WHERE Name = 'Sel'),            1,   'tsp', NULL,              7),

-- 11. Croissants pesto jambon
(11, (SELECT Id FROM Ingredients WHERE Name = 'Farine'), 1,  NULL,   'pâte feuilletée', 1),
(11, (SELECT Id FROM Ingredients WHERE Name = 'Pesto'),  6,  'tbsp', NULL,              2),
(11, (SELECT Id FROM Ingredients WHERE Name = 'Jambon'), 8,  NULL,   'tranches fines',  3),
(11, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),   1,  NULL,   'pour la dorure',  4),

-- 12. Galette des rois salée
(12, (SELECT Id FROM Ingredients WHERE Name = 'Farine'),            2,   NULL, 'rouleaux de pâte feuilletée', 1),
(12, (SELECT Id FROM Ingredients WHERE Name = 'Épinard'),           300, 'g',  'frais ou surgelés',           2),
(12, (SELECT Id FROM Ingredients WHERE Name = 'Fromage de chèvre'), 200, 'g',  NULL,                          3),
(12, (SELECT Id FROM Ingredients WHERE Name = 'Noix'),              50,  'g',  'concassées',                  4),
(12, (SELECT Id FROM Ingredients WHERE Name = 'Ail'),               2,   NULL, 'gousses',                     5),
(12, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),              1,   NULL, 'pour la dorure',              6),

-- 13. Punch délicieux
(13, (SELECT Id FROM Ingredients WHERE Name = 'Ananas'),            500, 'ml', 'jus d''ananas',       1),
(13, (SELECT Id FROM Ingredients WHERE Name = 'Orange'),            300, 'ml', 'jus d''orange pressé',2),
(13, (SELECT Id FROM Ingredients WHERE Name = 'Citron vert'),       3,   NULL, 'jus seulement',       3),
(13, (SELECT Id FROM Ingredients WHERE Name = 'Sirop de grenadine'),50,  'ml', NULL,                  4),
(13, (SELECT Id FROM Ingredients WHERE Name = 'Rhum'),              200, 'ml', 'rhum blanc',          5),
(13, (SELECT Id FROM Ingredients WHERE Name = 'Menthe'),            1,   NULL, 'bouquet',             6),

-- 14. Gambas armoricaine
(14, (SELECT Id FROM Ingredients WHERE Name = 'Gambas'),              1000, 'g',    'gambas entières', 1),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Crème fraîche'),       200,  'ml',   NULL,              2),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Concentré de tomate'), 2,    'tbsp', NULL,              3),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Échalote'),            3,    NULL,   NULL,              4),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Ail'),                 2,    NULL,   'gousses',         5),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Beurre'),              30,   'g',    NULL,              6),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Huile d''olive'),      2,    'tbsp', NULL,              7),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Thym'),                2,    NULL,   'brins',           8),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Laurier'),             2,    NULL,   'feuilles',        9),
(14, (SELECT Id FROM Ingredients WHERE Name = 'Persil'),              1,    NULL,   'bouquet',         10),

-- 15. Gâche vendéenne
(15, (SELECT Id FROM Ingredients WHERE Name = 'Farine'),           500, 'g',  NULL,                         1),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Levure boulangère'),10,  'g',  'levure fraîche de boulanger', 2),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),            80,  'g',  NULL,                         3),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),             3,   NULL, NULL,                         4),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Beurre demi-sel'),  100, 'g',  'ramolli',                    5),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Crème fraîche'),    100, 'ml', NULL,                         6),
(15, (SELECT Id FROM Ingredients WHERE Name = 'Sel'),              5,   'g',  NULL,                         7),

-- 16. Egg McMuffin
(16, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),       2, NULL,    NULL,                1),
(16, (SELECT Id FROM Ingredients WHERE Name = 'Bacon'),      4, NULL,    'tranches de bacon', 2),
(16, (SELECT Id FROM Ingredients WHERE Name = 'Cheddar'),    2, NULL,    'tranches épaisses', 3),
(16, (SELECT Id FROM Ingredients WHERE Name = 'Beurre'),     10,'g',     NULL,                4),
(16, (SELECT Id FROM Ingredients WHERE Name = 'Sel'),        1, 'pinch', NULL,                5),
(16, (SELECT Id FROM Ingredients WHERE Name = 'Poivre noir'),1, 'pinch', NULL,                6),

-- 17. Omelette aux pruneaux
(17, (SELECT Id FROM Ingredients WHERE Name = 'Oeuf'),     3, NULL,   NULL,                  1),
(17, (SELECT Id FROM Ingredients WHERE Name = 'Prune'),    8, NULL,   'pruneaux dénoyautés', 2),
(17, (SELECT Id FROM Ingredients WHERE Name = 'Cannelle'), 1, 'tsp',  NULL,                  3),
(17, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),    1, 'tbsp', NULL,                  4),
(17, (SELECT Id FROM Ingredients WHERE Name = 'Beurre'),   10,'g',    NULL,                  5),
(17, (SELECT Id FROM Ingredients WHERE Name = 'Miel'),     1, 'tbsp', 'pour servir',         6),

-- 18. Cocktail ouzo
(18, (SELECT Id FROM Ingredients WHERE Name = 'Citron vert'), 2, NULL,   'jus seulement', 1),
(18, (SELECT Id FROM Ingredients WHERE Name = 'Miel'),        2, 'tbsp', 'sirop de miel', 2),
(18, (SELECT Id FROM Ingredients WHERE Name = 'Menthe'),      4, NULL,   'feuilles',      3),

-- 19. Mojito à la bière
(19, (SELECT Id FROM Ingredients WHERE Name = 'Bière'),      330, 'ml',   'bière blonde par personne', 1),
(19, (SELECT Id FROM Ingredients WHERE Name = 'Citron vert'), 1,  NULL,   'par personne',              2),
(19, (SELECT Id FROM Ingredients WHERE Name = 'Menthe'),     10,  NULL,   'feuilles de menthe',        3),
(19, (SELECT Id FROM Ingredients WHERE Name = 'Rhum'),       40,  'ml',   'rhum blanc par personne',   4),
(19, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),      1,   'tbsp', 'sucre de canne',            5),

-- 20. Chocolat chaud maison
(20, (SELECT Id FROM Ingredients WHERE Name = 'Chocolat noir'), 80,  'g',    'chocolat noir 70% minimum', 1),
(20, (SELECT Id FROM Ingredients WHERE Name = 'Lait'),          400, 'ml',   'lait entier de préférence', 2),
(20, (SELECT Id FROM Ingredients WHERE Name = 'Sucre'),         1,   'tbsp', 'optionnel',                 3),
(20, (SELECT Id FROM Ingredients WHERE Name = 'Vanille'),       1,   'pinch','optionnel',                 4);


-- =====================================================
-- RECIPE TAGS (résolution par nom, pas par ID)
-- =====================================================

INSERT INTO RecipeTags (RecipeId, TagId) VALUES
(1,  (SELECT Id FROM Tags WHERE Name = 'Apéritif')),
(1,  (SELECT Id FROM Tags WHERE Name = 'Facile')),
(1,  (SELECT Id FROM Tags WHERE Name = 'Rapide')),
(1,  (SELECT Id FROM Tags WHERE Name = 'Cuit au four')),
(2,  (SELECT Id FROM Tags WHERE Name = 'Plat principal')),
(2,  (SELECT Id FROM Tags WHERE Name = 'Facile')),
(2,  (SELECT Id FROM Tags WHERE Name = 'Cuisine asiatique')),
(2,  (SELECT Id FROM Tags WHERE Name = 'Mijoté')),
(3,  (SELECT Id FROM Tags WHERE Name = 'Entrée')),
(3,  (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(3,  (SELECT Id FROM Tags WHERE Name = 'Végétarien')),
(3,  (SELECT Id FROM Tags WHERE Name = 'Healthy')),
(4,  (SELECT Id FROM Tags WHERE Name = 'Dessert')),
(4,  (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(4,  (SELECT Id FROM Tags WHERE Name = 'Cuit au four')),
(4,  (SELECT Id FROM Tags WHERE Name = 'Repas de fête')),
(5,  (SELECT Id FROM Tags WHERE Name = 'Dessert')),
(5,  (SELECT Id FROM Tags WHERE Name = 'Difficile')),
(5,  (SELECT Id FROM Tags WHERE Name = 'Repas de fête')),
(5,  (SELECT Id FROM Tags WHERE Name = 'Noël')),
(6,  (SELECT Id FROM Tags WHERE Name = 'Dessert')),
(6,  (SELECT Id FROM Tags WHERE Name = 'Facile')),
(6,  (SELECT Id FROM Tags WHERE Name = 'Végétarien')),
(6,  (SELECT Id FROM Tags WHERE Name = 'Cuisine française')),
(7,  (SELECT Id FROM Tags WHERE Name = 'Entrée')),
(7,  (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(7,  (SELECT Id FROM Tags WHERE Name = 'Cuisine asiatique')),
(7,  (SELECT Id FROM Tags WHERE Name = 'Healthy')),
(8,  (SELECT Id FROM Tags WHERE Name = 'Entrée')),
(8,  (SELECT Id FROM Tags WHERE Name = 'Facile')),
(8,  (SELECT Id FROM Tags WHERE Name = 'Comfort food')),
(8,  (SELECT Id FROM Tags WHERE Name = 'Cuisine française')),
(9,  (SELECT Id FROM Tags WHERE Name = 'Soupe')),
(9,  (SELECT Id FROM Tags WHERE Name = 'Facile')),
(9,  (SELECT Id FROM Tags WHERE Name = 'Végétarien')),
(9,  (SELECT Id FROM Tags WHERE Name = 'Économique')),
(9,  (SELECT Id FROM Tags WHERE Name = 'Healthy')),
(10, (SELECT Id FROM Tags WHERE Name = 'Soupe')),
(10, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(10, (SELECT Id FROM Tags WHERE Name = 'Mijoté')),
(10, (SELECT Id FROM Tags WHERE Name = 'Comfort food')),
(10, (SELECT Id FROM Tags WHERE Name = 'Cuisine française')),
(11, (SELECT Id FROM Tags WHERE Name = 'Apéritif')),
(11, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(11, (SELECT Id FROM Tags WHERE Name = 'Rapide')),
(11, (SELECT Id FROM Tags WHERE Name = 'Brunch')),
(12, (SELECT Id FROM Tags WHERE Name = 'Apéritif')),
(12, (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(12, (SELECT Id FROM Tags WHERE Name = 'Végétarien')),
(12, (SELECT Id FROM Tags WHERE Name = 'Cuit au four')),
(13, (SELECT Id FROM Tags WHERE Name = 'Boisson')),
(13, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(13, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(13, (SELECT Id FROM Tags WHERE Name = 'Repas de fête')),
(14, (SELECT Id FROM Tags WHERE Name = 'Plat principal')),
(14, (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(14, (SELECT Id FROM Tags WHERE Name = 'Repas de fête')),
(14, (SELECT Id FROM Tags WHERE Name = 'Cuisine française')),
(15, (SELECT Id FROM Tags WHERE Name = 'Petit-déjeuner')),
(15, (SELECT Id FROM Tags WHERE Name = 'Intermédiaire')),
(15, (SELECT Id FROM Tags WHERE Name = 'Cuit au four')),
(15, (SELECT Id FROM Tags WHERE Name = 'Fait maison')),
(16, (SELECT Id FROM Tags WHERE Name = 'Petit-déjeuner')),
(16, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(16, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(16, (SELECT Id FROM Tags WHERE Name = 'Brunch')),
(17, (SELECT Id FROM Tags WHERE Name = 'Petit-déjeuner')),
(17, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(17, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(17, (SELECT Id FROM Tags WHERE Name = 'Cuisine française')),
(18, (SELECT Id FROM Tags WHERE Name = 'Boisson')),
(18, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(18, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(18, (SELECT Id FROM Tags WHERE Name = 'Cuisine grecque')),
(19, (SELECT Id FROM Tags WHERE Name = 'Boisson')),
(19, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(19, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(19, (SELECT Id FROM Tags WHERE Name = 'Fait maison')),
(20, (SELECT Id FROM Tags WHERE Name = 'Boisson')),
(20, (SELECT Id FROM Tags WHERE Name = 'Facile')),
(20, (SELECT Id FROM Tags WHERE Name = 'Très rapide')),
(20, (SELECT Id FROM Tags WHERE Name = 'Comfort food')),
(20, (SELECT Id FROM Tags WHERE Name = 'Fait maison'));


-- =====================================================
-- RECIPE EQUIPMENTS (résolution par nom, pas par ID)
-- =====================================================

INSERT INTO RecipeEquipments (RecipeId, EquipmentId) VALUES
(1,  (SELECT Id FROM Equipments WHERE Name = 'Four')),
(1,  (SELECT Id FROM Equipments WHERE Name = 'Planche à découper')),
(1,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(2,  (SELECT Id FROM Equipments WHERE Name = 'Sauteuse')),
(2,  (SELECT Id FROM Equipments WHERE Name = 'Planche à découper')),
(2,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(3,  (SELECT Id FROM Equipments WHERE Name = 'Casserole')),
(3,  (SELECT Id FROM Equipments WHERE Name = 'Mixeur')),
(3,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(4,  (SELECT Id FROM Equipments WHERE Name = 'Moule à tarte')),
(4,  (SELECT Id FROM Equipments WHERE Name = 'Four')),
(4,  (SELECT Id FROM Equipments WHERE Name = 'Bol mélangeur')),
(4,  (SELECT Id FROM Equipments WHERE Name = 'Rouleau à pâtisserie')),
(5,  (SELECT Id FROM Equipments WHERE Name = 'Four')),
(5,  (SELECT Id FROM Equipments WHERE Name = 'Saladier')),
(5,  (SELECT Id FROM Equipments WHERE Name = 'Fouet')),
(5,  (SELECT Id FROM Equipments WHERE Name = 'Poche à douille')),
(6,  (SELECT Id FROM Equipments WHERE Name = 'Casserole')),
(6,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(7,  (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(7,  (SELECT Id FROM Equipments WHERE Name = 'Planche à découper')),
(7,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(7,  (SELECT Id FROM Equipments WHERE Name = 'Râpe')),
(8,  (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(8,  (SELECT Id FROM Equipments WHERE Name = 'Casserole')),
(8,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(9,  (SELECT Id FROM Equipments WHERE Name = 'Marmite')),
(9,  (SELECT Id FROM Equipments WHERE Name = 'Mixeur')),
(9,  (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(10, (SELECT Id FROM Equipments WHERE Name = 'Marmite')),
(10, (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(11, (SELECT Id FROM Equipments WHERE Name = 'Four')),
(11, (SELECT Id FROM Equipments WHERE Name = 'Planche à découper')),
(11, (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(12, (SELECT Id FROM Equipments WHERE Name = 'Four')),
(12, (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(12, (SELECT Id FROM Equipments WHERE Name = 'Rouleau à pâtisserie')),
(13, (SELECT Id FROM Equipments WHERE Name = 'Saladier')),
(14, (SELECT Id FROM Equipments WHERE Name = 'Sauteuse')),
(14, (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(14, (SELECT Id FROM Equipments WHERE Name = 'Couteau de cuisine')),
(15, (SELECT Id FROM Equipments WHERE Name = 'Robot de cuisine')),
(15, (SELECT Id FROM Equipments WHERE Name = 'Four')),
(16, (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(17, (SELECT Id FROM Equipments WHERE Name = 'Poêle')),
(18, (SELECT Id FROM Equipments WHERE Name = 'Saladier')),
(19, (SELECT Id FROM Equipments WHERE Name = 'Saladier')),
(20, (SELECT Id FROM Equipments WHERE Name = 'Casserole')),
(20, (SELECT Id FROM Equipments WHERE Name = 'Fouet'));


-- =====================================================
-- COMMENTS
-- Statuts : normaux, modérés (ModeratedAt set), supprimés soft (DeletedAt set), réponses
-- =====================================================

INSERT INTO Comments (Id, RecipeId, UserId, ParentCommentId, Rating, Comment, CreatedAt, ModeratedAt, ModeratedByUserId, DeletedAt, DeletedByUserId) VALUES

-- Recette 1 : Feuilletés chorizo feta
(1,  1, 3, NULL, 5, 'Testés hier soir pour l''apéro, ils ont été dévorés en 5 minutes ! J''ai ajouté un peu de paprika fumé, c''était encore meilleur.', '2024-10-08 19:30:00', NULL, NULL, NULL, NULL),
(2,  1, 4, NULL, 4, 'Très bien, j''ai remplacé la feta par du chèvre, ça marche aussi.', '2024-10-09 10:15:00', NULL, NULL, NULL, NULL),
(3,  1, 5, 1, NULL, 'Super idée le paprika fumé, je vais essayer !', '2024-10-09 11:00:00', NULL, NULL, NULL, NULL),
-- Commentaire supprimé soft (spam)
(4,  1, 7, NULL, 1, 'Achetez mes produits miracle sur www.spam-link.fr !!!', '2024-10-10 08:00:00', NULL, NULL, '2024-10-10 08:30:00', 1),

-- Recette 2 : Poulet coco curry
(5,  2, 4, NULL, 5, 'Recette incroyable ! Je fais du curry depuis des années mais celui-là est vraiment exceptionnel. Le secret c''est bien le lait de coco de qualité.', '2024-10-14 20:00:00', NULL, NULL, NULL, NULL),
(6,  2, 5, NULL, 4, 'Bon équilibre des épices. J''ai ajouté un peu de gingembre frais râpé et une touche de citronnelle, ça apporte beaucoup de fraîcheur.', '2024-10-15 12:30:00', NULL, NULL, NULL, NULL),
(7,  2, 4, 5, NULL, 'Oh oui la citronnelle c''est une excellente idée, je note !', '2024-10-15 14:00:00', NULL, NULL, NULL, NULL),
-- Commentaire modéré (hors-sujet agressif)
(8,  2, 7, NULL, 1, 'NAZE. Le curry c''est une honte culinaire, les gens qui font ça sont des ignorants !!!', '2024-10-16 09:00:00', '2024-10-16 10:00:00', 1, NULL, NULL),

-- Recette 3 : Soupe asperges blanches
(9,  3, 3, NULL, 5, 'Parfaite pour un dîner chic sans trop d''effort. J''ai ajouté quelques copeaux de parmesan et c''était sublime.', '2024-10-18 21:00:00', NULL, NULL, NULL, NULL),
(10, 3, 5, NULL, 4, 'Très délicate. Je recommande de bien sécher les asperges avant de les cuire pour éviter une soupe trop aqueuse.', '2024-10-19 13:00:00', NULL, NULL, NULL, NULL),

-- Recette 4 : Tarte chocolat orange
(11, 4, 3, NULL, 5, 'Cette tarte est un chef-d''œuvre. J''ai utilisé du chocolat Valrhona et des oranges bio, le résultat était époustouflant.', '2024-10-24 18:00:00', NULL, NULL, NULL, NULL),
(12, 4, 4, NULL, 4, 'Très bonne recette mais attention : la ganache doit reposer au moins 2h au frais pour bien se tenir à la découpe.', '2024-10-25 15:30:00', NULL, NULL, NULL, NULL),
(13, 4, 3, 12, NULL, 'Tout à fait d''accord, j''ai fait la bêtise de la couper trop tôt... 😅', '2024-10-25 16:00:00', NULL, NULL, NULL, NULL),

-- Recette 7 : Tataki de thon
(14, 7, 5, NULL, 5, 'Magnifique recette ! Le thon était cru au centre avec juste une légère croûte en surface. Résultat bluffant.', '2024-11-08 20:00:00', NULL, NULL, NULL, NULL),
(15, 7, 3, NULL, 4, 'Très bien. J''ai mariné 1h au lieu de 30 min, c''était encore plus parfumé.', '2024-11-09 12:00:00', NULL, NULL, NULL, NULL),
-- Commentaire supprimé soft par l'auteur
(16, 7, 4, NULL, 2, 'Moyen, le thon était trop cuit chez moi.', '2024-11-09 14:00:00', NULL, NULL, '2024-11-10 09:00:00', 4),

-- Recette 9 : Soupe 7 légumes
(17, 9, 3, NULL, 5, 'La soupe de l''hiver par excellence ! Je la fais en grande quantité et je congèle des portions pour la semaine.', '2024-11-18 19:30:00', NULL, NULL, NULL, NULL),
(18, 9, 5, NULL, 4, 'Très nourrissante. J''y ajoute toujours des pois chiches pour encore plus de protéines.', '2024-11-19 11:00:00', NULL, NULL, NULL, NULL),

-- Recette 10 : Soupe chou vert
(19, 10, 4, NULL, 5, 'Un grand classique de ma grand-mère ! Cette recette est exactement la bonne. Merci de l''avoir partagée.', '2024-11-23 20:00:00', NULL, NULL, NULL, NULL),
(20, 10, 3, 19, NULL, 'C''est tellement vrai, ce genre de recette mérite d''être transmis de génération en génération.', '2024-11-23 21:00:00', NULL, NULL, NULL, NULL),

-- Recette 14 : Gambas armoricaine
(21, 14, 5, NULL, 5, 'Recette de fête absolue. J''ai réalisé ce plat pour Noël et tout le monde a été conquis. Le flambage au cognac fait vraiment la différence.', '2024-12-14 21:00:00', NULL, NULL, NULL, NULL),
(22, 14, 3, NULL, 5, 'Parfait ! J''ai ajouté une pointe de piment d''Espelette dans la sauce, c''est encore meilleur.', '2024-12-15 10:00:00', NULL, NULL, NULL, NULL),

-- Recette 15 : Gâche vendéenne
(23, 15, 4, NULL, 5, 'Enfin la vraie recette de la gâche vendéenne ! Je suis vendéenne et c''est exactement comme ça qu''on la fait chez nous.', '2024-12-18 09:30:00', NULL, NULL, NULL, NULL),
(24, 15, 3, NULL, 4, 'Très bonne mais j''ai dû ajouter un peu de lait car ma pâte était trop sèche. Peut-être une question de farine.', '2024-12-18 14:00:00', NULL, NULL, NULL, NULL),

-- Recette 20 : Chocolat chaud
(25, 20, 5, NULL, 5, 'Plus jamais le chocolat en sachet ! Cette recette a changé ma vie, c''est d''une onctuosité incomparable.', '2025-01-22 20:00:00', NULL, NULL, NULL, NULL),
(26, 20, 4, NULL, 5, 'J''ai ajouté une pincée de fleur de sel et une touche de piment d''Espelette. Incroyable !', '2025-01-23 09:00:00', NULL, NULL, NULL, NULL),
(27, 20, 5, 26, NULL, 'Oh la belle idée ! Je n''aurais jamais pensé au piment, merci !', '2025-01-23 10:00:00', NULL, NULL, NULL, NULL)

AS new_comments
ON DUPLICATE KEY UPDATE Comment = new_comments.Comment;


-- =====================================================
-- FAVORITES
-- =====================================================

INSERT INTO Favorites (UserId, RecipeId, CreatedAt) VALUES
-- MarieDupont (UserId=3) : aime les desserts et les plats festifs
(3, 4,  '2024-10-22 10:00:00'),
(3, 5,  '2024-10-27 18:00:00'),
(3, 14, '2024-12-12 20:00:00'),
(3, 20, '2025-01-22 21:00:00'),
(3, 7,  '2024-11-07 12:00:00'),

-- ThomasMartin (UserId=4) : fan de cuisine du quotidien
(4, 2,  '2024-10-12 19:00:00'),
(4, 9,  '2024-11-17 12:00:00'),
(4, 10, '2024-11-22 20:00:00'),
(4, 15, '2024-12-17 09:00:00'),
(4, 1,  '2024-10-07 19:30:00'),
(4, 8,  '2024-11-12 20:00:00'),

-- SophieCuisine (UserId=5) : curieuse, aime tout
(5, 1,  '2024-10-07 20:00:00'),
(5, 2,  '2024-10-12 20:00:00'),
(5, 4,  '2024-10-22 21:00:00'),
(5, 6,  '2024-11-03 18:00:00'),
(5, 7,  '2024-11-07 20:00:00'),
(5, 11, '2024-11-27 19:00:00'),
(5, 14, '2024-12-12 21:00:00'),
(5, 20, '2025-01-22 22:00:00')

AS new_favorites
ON DUPLICATE KEY UPDATE CreatedAt = new_favorites.CreatedAt;

COMMIT;
