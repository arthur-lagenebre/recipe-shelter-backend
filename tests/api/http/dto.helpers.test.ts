import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getBoundedArray, getBoundedInteger, getBoundedNullableInteger, getBoundedNullableNumber, getBoundedString, getRequiredBoundedString } from '../../../src/api/http/dto.helpers.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('dto.helpers bounded validators', () => {
    describe('getBoundedInteger', () => {
        it('returns undefined for an absent value', () => {
            assert.equal(getBoundedInteger(undefined, 1, 10, 'msg', 'CODE'), undefined);
            assert.equal(getBoundedInteger(null, 1, 10, 'msg', 'CODE'), undefined);
        });

        it('accepts an integer within bounds', () => {
            assert.equal(getBoundedInteger(5, 1, 10, 'msg', 'CODE'), 5);
            assert.equal(getBoundedInteger(1, 1, 10, 'msg', 'CODE'), 1);
            assert.equal(getBoundedInteger(10, 1, 10, 'msg', 'CODE'), 10);
        });

        it('rejects a value below the minimum', () => {
            assert.throws(() => getBoundedInteger(0, 1, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects a value above the maximum', () => {
            assert.throws(() => getBoundedInteger(11, 1, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects a non-integer number', () => {
            assert.throws(() => getBoundedInteger(5.5, 1, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects a non-number', () => {
            assert.throws(() => getBoundedInteger('5', 1, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });
    });

    describe('getBoundedNullableInteger', () => {
        it('returns undefined for undefined and null for null', () => {
            assert.equal(getBoundedNullableInteger(undefined, 0, 10, 'msg', 'CODE'), undefined);
            assert.equal(getBoundedNullableInteger(null, 0, 10, 'msg', 'CODE'), null);
        });

        it('accepts an integer within bounds', () => {
            assert.equal(getBoundedNullableInteger(0, 0, 10, 'msg', 'CODE'), 0);
            assert.equal(getBoundedNullableInteger(10, 0, 10, 'msg', 'CODE'), 10);
        });

        it('rejects out-of-bounds and non-integer values', () => {
            for (const value of [-1, 11, 5.5]) {
                assert.throws(() => getBoundedNullableInteger(value, 0, 10, 'msg', 'CODE'), (error) => {
                    assertHttpError(error, 'CODE', 400);
                    return true;
                });
            }
        });
    });

    describe('getBoundedNullableNumber', () => {
        it('returns undefined for undefined and null for null', () => {
            assert.equal(getBoundedNullableNumber(undefined, 0, 100, 'msg', 'CODE'), undefined);
            assert.equal(getBoundedNullableNumber(null, 0, 100, 'msg', 'CODE'), null);
        });

        it('accepts a decimal value within bounds', () => {
            assert.equal(getBoundedNullableNumber(2.5, 0, 100, 'msg', 'CODE'), 2.5);
        });

        it('rejects out-of-bounds values', () => {
            for (const value of [-0.1, 100.1]) {
                assert.throws(() => getBoundedNullableNumber(value, 0, 100, 'msg', 'CODE'), (error) => {
                    assertHttpError(error, 'CODE', 400);
                    return true;
                });
            }
        });

        it('rejects a non-number', () => {
            assert.throws(() => getBoundedNullableNumber('2', 0, 100, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });
    });

    describe('getBoundedString', () => {
        it('returns undefined for an absent value', () => {
            assert.equal(getBoundedString(undefined, 0, 10, 'msg', 'CODE'), undefined);
            assert.equal(getBoundedString(null, 0, 10, 'msg', 'CODE'), undefined);
        });

        it('trims and accepts a string within bounds', () => {
            assert.equal(getBoundedString('  hello  ', 0, 10, 'msg', 'CODE'), 'hello');
        });

        it('accepts an empty string when minLength is 0', () => {
            assert.equal(getBoundedString('   ', 0, 10, 'msg', 'CODE'), '');
        });

        it('rejects a string shorter than minLength', () => {
            assert.throws(() => getBoundedString('ab', 3, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects a string longer than maxLength', () => {
            assert.throws(() => getBoundedString('a'.repeat(11), 0, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('counts unicode characters correctly', () => {
            const emoji = '😀'.repeat(5);
            assert.equal(getBoundedString(emoji, 0, 5, 'msg', 'CODE'), emoji);
            assert.throws(() => getBoundedString('😀'.repeat(6), 0, 5, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects a non-string', () => {
            assert.throws(() => getBoundedString(5, 0, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });
    });

    describe('getRequiredBoundedString', () => {
        it('trims and accepts a string within bounds', () => {
            assert.equal(getRequiredBoundedString('  hello  ', 1, 10, 'msg', 'CODE'), 'hello');
        });

        it('rejects an absent or blank value', () => {
            for (const value of [undefined, null, '   ']) {
                assert.throws(() => getRequiredBoundedString(value, 1, 10, 'msg', 'CODE'), (error) => {
                    assertHttpError(error, 'CODE', 400);
                    return true;
                });
            }
        });

        it('rejects a string longer than maxLength', () => {
            assert.throws(() => getRequiredBoundedString('a'.repeat(11), 1, 10, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('counts unicode characters correctly', () => {
            const emoji = '😀'.repeat(5);
            assert.equal(getRequiredBoundedString(emoji, 1, 5, 'msg', 'CODE'), emoji);
            assert.throws(() => getRequiredBoundedString('😀'.repeat(6), 1, 5, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });
    });

    describe('getBoundedArray', () => {
        const parser = (item: unknown) => {
            if (typeof item !== 'number')
                throw new Error('should not be called on an already-invalid array');
            return item * 2;
        };

        it('returns undefined for an absent value', () => {
            assert.equal(getBoundedArray(undefined, 5, parser, 'msg', 'CODE'), undefined);
            assert.equal(getBoundedArray(null, 5, parser, 'msg', 'CODE'), undefined);
        });

        it('parses each item when within maxLength', () => {
            assert.deepEqual(getBoundedArray([1, 2, 3], 5, parser, 'msg', 'CODE'), [2, 4, 6]);
        });

        it('rejects a non-array', () => {
            assert.throws(() => getBoundedArray('not an array', 5, parser, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });

        it('rejects an array longer than maxLength without invoking the parser', () => {
            const oversized = new Array(6).fill('anything-invalid-for-parser');
            assert.throws(() => getBoundedArray(oversized, 5, parser, 'msg', 'CODE'), (error) => {
                assertHttpError(error, 'CODE', 400);
                return true;
            });
        });
    });
});
