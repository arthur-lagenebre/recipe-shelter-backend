import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';

import { TerminalSecretPrompter } from '../../src/cli/terminal-secret-prompter.js';

class FakeTty extends PassThrough {
    isRaw = false;
    isTTY = true;
    rawModeChanges: boolean[] = [];

    setRawMode(mode: boolean): void {
        this.isRaw = mode;
        this.rawModeChanges.push(mode);
    }
}

describe('TerminalSecretPrompter', () => {
    it('reads piped secret lines without echoing their values', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        let writtenOutput = '';
        output.setEncoding('utf8');
        output.on('data', (chunk: string) => { writtenOutput += chunk; });
        input.end('StrongPass42!\nStrongPass42!\n');

        const prompter = new TerminalSecretPrompter(input, output);

        assert.equal(await prompter.readSecret('Password: '), 'StrongPass42!');
        assert.equal(await prompter.readSecret('Confirm password: '), 'StrongPass42!');
        prompter.close();

        assert.equal(writtenOutput, 'Password: \nConfirm password: \n');
        assert.equal(writtenOutput.includes('StrongPass42!'), false);
    });

    it('disables terminal echo, accepts printable spaces and restores terminal mode', async () => {
        const input = new FakeTty();
        const output = new PassThrough();
        let writtenOutput = '';
        output.setEncoding('utf8');
        output.on('data', (chunk: string) => { writtenOutput += chunk; });
        const prompter = new TerminalSecretPrompter(input, output);

        const secretPromise = prompter.readSecret('Password: ');
        input.emit('keypress', 'Strong Pass42!', { name: undefined });
        input.emit('keypress', '', { name: 'enter' });

        assert.equal(await secretPromise, 'Strong Pass42!');
        assert.deepEqual(input.rawModeChanges, [true, false]);
        assert.equal(writtenOutput, 'Password: \n');
        assert.equal(writtenOutput.includes('Strong Pass42!'), false);
    });
});
