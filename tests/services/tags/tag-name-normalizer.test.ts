import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeTagName } from '../../../src/services/tags/tags.service.js';

describe('normalizeTagName', () => {
    it('normalizes case, accents, spaces and punctuation to one canonical value', () => {
        const variants = [
            'Crème brûlée',
            'CRÈME BRÛLÉE',
            'Creme brulee',
            '  Crème   brûlée  ',
            'Crème---brûlée!!!'
        ];

        assert.deepEqual(variants.map(normalizeTagName), Array(variants.length).fill('creme brulee'));
    });

    it('transliterates common latin letters that Unicode decomposition preserves', () => {
        assert.equal(normalizeTagName('L’Œuf, Straße & smørrebrød'), 'l oeuf strasse smorrebrod');
    });

    it('returns an empty value when the name contains no canonical characters', () => {
        assert.equal(normalizeTagName(' -- !!! -- '), '');
    });
});
