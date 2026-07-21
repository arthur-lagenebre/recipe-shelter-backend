const catalogNameTransliterations: ReadonlyArray<readonly [RegExp, string]> = [
    [/æ/g, 'ae'],
    [/œ/g, 'oe'],
    [/ß/g, 'ss'],
    [/ø/g, 'o'],
    [/[ðđ]/g, 'd'],
    [/ł/g, 'l']
];

export function normalizeCatalogName(name: string): string {
    let normalizedName = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/\p{M}+/gu, '');

    for (const [characters, replacement] of catalogNameTransliterations) normalizedName = normalizedName.replace(characters, replacement);

    return normalizedName.replace(/[^a-z0-9]+/g, ' ').trim();
}
