import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeCatalogName } from '../../src/utils/catalog-name-normalizer.js';

describe('normalizeCatalogName', () => {
    it('normalizes case, accents, spaces and punctuation to one canonical value', () => {
        const variants = ['Crème brûlée', 'CRÈME BRÛLÉE', 'Creme brulee', '  Crème   brûlée  ', 'Crème---brûlée!!!'];

        assert.deepEqual(variants.map(normalizeCatalogName), Array(variants.length).fill('creme brulee'));
    });

    it('transliterates common latin letters that Unicode decomposition preserves', () => {
        assert.equal(normalizeCatalogName('L’Œuf, Straße & smørrebrød'), 'l oeuf strasse smorrebrod');
    });

    it('returns an empty value when the name contains no canonical characters', () => {
        assert.equal(normalizeCatalogName(' -- !!! -- '), '');
    });

    it('normalizes an equipment-flavored name the same way as tag and ingredient names', () => {
        assert.equal(normalizeCatalogName('Coupe-œuf'), 'coupe oeuf');
    });
});
