import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default [
    {
        ignores: ['dist/**', 'node_modules/**']
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ['src/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node
            },
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module'
            }
        },
        plugins: {
            import: importPlugin
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'inline-type-imports'
                }
            ],

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],

            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
                    'newlines-between': 'always',
                    alphabetize: {
                        order: 'asc',
                        caseInsensitive: true
                    }
                }
            ]
        }
    },

    eslintConfigPrettier
];
