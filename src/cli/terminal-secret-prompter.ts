import readline from 'node:readline';

import type { SecretPrompter } from './bootstrap-super-admin.command.js';
import type { Readable, Writable } from 'node:stream';

type TtyReadable = Readable & {
    isRaw?: boolean;
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
};

type Key = {
    ctrl?: boolean;
    meta?: boolean;
    name?: string;
};

export class TerminalSecretPrompter implements SecretPrompter {
    private lineReader: readline.Interface | undefined;
    private lineIterator: AsyncIterator<string> | undefined;

    constructor(
        private readonly input: TtyReadable = process.stdin,
        private readonly output: Writable = process.stdout
    ) { }

    async readSecret(label: string): Promise<string> {
        this.output.write(label);

        if (this.input.isTTY && this.input.setRawMode)
            return this.readSecretFromTty();

        this.lineReader ??= readline.createInterface({
            input: this.input,
            crlfDelay: Infinity,
            terminal: false });
        this.lineIterator ??= this.lineReader[Symbol.asyncIterator]();

        const line = await this.lineIterator.next();
        if (line.done)
            throw new Error('Standard input ended before the password was read');

        this.output.write('\n');
        return line.value;
    }

    close(): void {
        this.lineReader?.close();
    }

    private readSecretFromTty(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const wasRaw = Boolean(this.input.isRaw);
            let value = '';
            let settled = false;

            const cleanup = () => {
                this.input.off('keypress', handleKeypress);
                this.input.off('end', handleEnd);
                this.input.off('error', handleError);
                this.input.setRawMode?.(wasRaw);
                this.input.pause();
            };
            const finish = (action: () => void) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                this.output.write('\n');
                action();
            };
            const handleEnd = () => finish(() => reject(new Error('Standard input ended before the password was read')));
            const handleError = (error: Error) => finish(() => reject(error));
            const handleKeypress = (character: string, key: Key) => {
                if (key.ctrl && key.name === 'c') {
                    finish(() => reject(new Error('Command interrupted')));
                    return;
                }

                if (key.name === 'return' || key.name === 'enter') {
                    finish(() => resolve(value));
                    return;
                }

                if (key.name === 'backspace') {
                    value = Array.from(value).slice(0, -1).join('');
                    return;
                }

                if (!key.ctrl && !key.meta && isPrintable(character))
                    value += character;
            };

            readline.emitKeypressEvents(this.input);
            this.input.on('keypress', handleKeypress);
            this.input.once('end', handleEnd);
            this.input.once('error', handleError);
            this.input.setRawMode?.(true);
            this.input.resume();
        });
    }
}

function isPrintable(value: string): boolean {
    return value.length > 0 && Array.from(value).every(
        (character) => character >= ' ' && character !== '\u007f' && character !== '\u001b'
    );
}
