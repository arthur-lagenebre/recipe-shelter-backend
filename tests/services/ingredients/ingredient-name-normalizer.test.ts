import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeIngredientName } from '../../../src/services/ingredients/ingredients.service.js';

describe('normalizeIngredientName', () => {
    it('normalizes case, accents, spaces and punctuation to one canonical value', () => {
        const variants = [
            'Crème fraîche',
            'CRÈME FRAÎCHE',
            'Creme fraiche',
            '  Crème   fraîche  ',
            'Crème---fraîche!!!'
        ];

        assert.deepEqual(variants.map(normalizeIngredientName), Array(variants.length).fill('creme fraiche'));
    });

    it('transliterates common latin letters that Unicode decomposition preserves', () => {
        assert.equal(normalizeIngredientName('Œuf, Straße & smørrebrød'), 'oeuf strasse smorrebrod');
    });

    it('returns an empty value when the name contains no canonical characters', () => {
        assert.equal(normalizeIngredientName(' -- !!! -- '), '');
    });
});
