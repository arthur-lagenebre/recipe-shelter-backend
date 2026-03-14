DROP DATABASE IF EXISTS recipe_shelter;
CREATE DATABASE recipe_shelter
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE recipe_shelter;

SOURCE database/1_create_schema.sql;
SOURCE database/2_seed.sql;