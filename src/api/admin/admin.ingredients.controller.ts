import { getAdminAuditRequestContext } from './admin.audit.context.js';
import {
    parseAdminIngredientActionReasonBody,
    parseAdminIngredientAliasIdParam,
    parseAdminIngredientAliasListFilters,
    parseAdminIngredientIdParam,
    parseAdminIngredientListFilters,
    parseCreateAdminIngredientAliasBody,
    parseCreateAdminIngredientBody,
    parseMergeAdminIngredientBody,
    parseUpdateAdminIngredientAliasBody,
    parseUpdateAdminIngredientBody
} from './admin.ingredients.dto.js';
import { parsePaginationQuery } from '../../utils/pagination.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AdminIngredientService } from '../../services/admin/admin.ingredients.service.js';

const DEFAULT_ADMIN_INGREDIENT_LIMIT = 25;
const DEFAULT_ADMIN_INGREDIENT_ALIAS_LIMIT = 25;

export function createAdminIngredientsController(ingredients: AdminIngredientService) {
    return {
        list: asyncHandler(async (req, res) => {
            const filters = parseAdminIngredientListFilters(req.query);
            const pagination = parsePaginationQuery(req.query, DEFAULT_ADMIN_INGREDIENT_LIMIT, 'ADMIN_INGREDIENTS_PAGINATION');
            const result = await ingredients.list(filters, pagination, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(result);
        }),

        create: asyncHandler(async (req, res) => {
            const input = parseCreateAdminIngredientBody(req.body);
            const ingredient = await ingredients.create(input, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(201).json(ingredient);
        }),

        update: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const input = parseUpdateAdminIngredientBody(req.body);
            const ingredient = await ingredients.update(ingredientId, input, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(ingredient);
        }),

        deprecate: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const reason = parseAdminIngredientActionReasonBody(req.body, 'deprecate');
            const ingredient = await ingredients.deprecate(ingredientId, reason, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(ingredient);
        }),

        restore: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const reason = parseAdminIngredientActionReasonBody(req.body, 'restore');
            const ingredient = await ingredients.restore(ingredientId, reason, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(ingredient);
        }),

        merge: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const input = parseMergeAdminIngredientBody(req.body);
            const ingredient = await ingredients.merge(ingredientId, input, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(ingredient);
        }),

        listAliases: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const filters = parseAdminIngredientAliasListFilters(req.query);
            const pagination = parsePaginationQuery(req.query, DEFAULT_ADMIN_INGREDIENT_ALIAS_LIMIT, 'ADMIN_INGREDIENT_ALIASES_PAGINATION');
            const result = await ingredients.listAliases(
                ingredientId,
                filters,
                pagination,
                req.auth!.userId,
                getAdminAuditRequestContext(req)
            );

            res.status(200).json(result);
        }),

        createAlias: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const input = parseCreateAdminIngredientAliasBody(req.body);
            const alias = await ingredients.createAlias(ingredientId, input, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(201).json(alias);
        }),

        updateAlias: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const aliasId = parseAdminIngredientAliasIdParam(req.params.aliasId);
            const input = parseUpdateAdminIngredientAliasBody(req.body);
            const alias = await ingredients.updateAlias(ingredientId, aliasId, input, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(200).json(alias);
        }),

        deleteAlias: asyncHandler(async (req, res) => {
            const ingredientId = parseAdminIngredientIdParam(req.params.id);
            const aliasId = parseAdminIngredientAliasIdParam(req.params.aliasId);
            await ingredients.deleteAlias(ingredientId, aliasId, req.auth!.userId, getAdminAuditRequestContext(req));

            res.status(204).end();
        })
    };
}
