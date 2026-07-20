import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseContactMessageBody } from '../../../src/api/contact/contact.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('contact.dto', () => {
    it('parses and trims a contact message body', () => {
        const result = parseContactMessageBody({
            name: ' John Doe ',
            email: ' john@example.com ',
            subject: ' Question ',
            message: ' Bonjour, je voudrais en savoir plus. '
        });

        assert.deepEqual(result, {
            name: 'John Doe',
            email: 'john@example.com',
            subject: 'Question',
            message: 'Bonjour, je voudrais en savoir plus.'
        });
    });

    it('rejects missing fields', () => {
        assert.throws(
            () =>
                parseContactMessageBody({
                    name: 'John Doe',
                    email: 'john@example.com',
                    subject: 'Question'
                }),
            (error) => {
                assertHttpError(error, 'CONTACT_MISSING_FIELDS', 400);

                return true;
            }
        );
    });

    it('rejects invalid email addresses', () => {
        assert.throws(
            () =>
                parseContactMessageBody({
                    name: 'John Doe',
                    email: 'john',
                    subject: 'Question',
                    message: 'Bonjour, je voudrais en savoir plus.'
                }),
            (error) => {
                assertHttpError(error, 'CONTACT_INVALID_EMAIL', 400);

                return true;
            }
        );
    });

    it('rejects messages that are too short', () => {
        assert.throws(
            () =>
                parseContactMessageBody({
                    name: 'John Doe',
                    email: 'john@example.com',
                    subject: 'Question',
                    message: 'Bonjour'
                }),
            (error) => {
                assertHttpError(error, 'CONTACT_MESSAGE_TOO_SHORT', 400);

                return true;
            }
        );
    });

    it('rejects fields that are too long', () => {
        assert.throws(
            () =>
                parseContactMessageBody({
                    name: 'J'.repeat(101),
                    email: 'john@example.com',
                    subject: 'Question',
                    message: 'Bonjour, je voudrais en savoir plus.'
                }),
            (error) => {
                assertHttpError(error, 'CONTACT_NAME_TOO_LONG', 400);

                return true;
            }
        );

        assert.throws(
            () =>
                parseContactMessageBody({
                    name: 'John Doe',
                    email: 'john@example.com',
                    subject: 'Q'.repeat(151),
                    message: 'Bonjour, je voudrais en savoir plus.'
                }),
            (error) => {
                assertHttpError(error, 'CONTACT_SUBJECT_TOO_LONG', 400);

                return true;
            }
        );
    });
});
