type MysqlScriptConnection = {
    query(sql: string): Promise<unknown>;
};

function findDelimiter(sql: string, delimiter: string): number {
    let quote: "'" | '"' | '`' | undefined;
    let inBlockComment = false;
    let inLineComment = false;

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index];
        const nextCharacter = sql[index + 1];

        if (inLineComment) {
            if (character === '\n' || character === '\r') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (character === '*' && nextCharacter === '/') {
                inBlockComment = false;
                index += 1;
            }
            continue;
        }

        if (quote) {
            if (character === '\\') {
                index += 1;
                continue;
            }
            if (character === quote) {
                if (nextCharacter === quote) index += 1;
                else quote = undefined;
            }
            continue;
        }

        if (character === '-' && nextCharacter === '-' && /\s/.test(sql[index + 2] ?? '')) {
            inLineComment = true;
            index += 1;
            continue;
        }
        if (character === '#') {
            inLineComment = true;
            continue;
        }
        if (character === '/' && nextCharacter === '*') {
            inBlockComment = true;
            index += 1;
            continue;
        }
        if (character === "'" || character === '"' || character === '`') {
            quote = character;
            continue;
        }
        if (sql.startsWith(delimiter, index)) return index;
    }

    return -1;
}

function hasExecutableSql(sql: string): boolean {
    const withoutComments = sql
        .replace(/--\s[^\r\n]*(?:\r?\n|$)/g, '')
        .replace(/#[^\r\n]*(?:\r?\n|$)/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return withoutComments.trim().length > 0;
}

export function splitMysqlScript(script: string): string[] {
    const statements: string[] = [];
    let delimiter = ';';
    let pending = '';

    for (const line of script.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
        if (!line) continue;

        const delimiterDirective = line.match(/^\s*DELIMITER\s+(\S+)\s*(?:\r\n|\n|\r)?$/i);
        if (delimiterDirective) {
            if (hasExecutableSql(pending))
                throw new Error('DELIMITER directive encountered before the preceding SQL statement was terminated');

            delimiter = delimiterDirective[1] ?? '';
            if (!delimiter) throw new Error('DELIMITER directive must define a non-empty delimiter');
            pending = '';
            continue;
        }

        pending += line;
        let delimiterIndex = findDelimiter(pending, delimiter);

        while (delimiterIndex >= 0) {
            const statement = pending.slice(0, delimiterIndex).trim();
            if (hasExecutableSql(statement)) statements.push(statement);

            pending = pending.slice(delimiterIndex + delimiter.length);
            delimiterIndex = findDelimiter(pending, delimiter);
        }
    }

    const finalStatement = pending.trim();
    if (hasExecutableSql(finalStatement)) statements.push(finalStatement);

    return statements;
}

export async function executeMysqlScript(connection: MysqlScriptConnection, script: string): Promise<void> {
    for (const statement of splitMysqlScript(script)) await connection.query(statement);
}
