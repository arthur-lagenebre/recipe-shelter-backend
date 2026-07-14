import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('image storage environment configuration', () => {
    it('fails explicitly at startup for an unknown storage driver', () => {
        const envModule = new URL('../../src/utils/env.ts', import.meta.url).href;
        const result = spawnSync(
            process.execPath,
            ['--import', 'tsx', '--input-type=module', '--eval', `await import(${JSON.stringify(envModule)})`],
            {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret',
                    IMAGE_STORAGE_DRIVER: 'unknown-driver'
                }
            }
        );

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Unknown IMAGE_STORAGE_DRIVER: unknown-driver/);
    });
});
