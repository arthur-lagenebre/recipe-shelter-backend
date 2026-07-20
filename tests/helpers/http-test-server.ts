import { createServer } from 'node:http';

import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

export type HttpTestServer = {
    baseUrl: string;
    close(): Promise<void>;
};

export async function startHttpTestServer(app: Express): Promise<HttpTestServer> {
    const server = createServer(app);

    await new Promise<void>((resolve, reject) => {
        const handleError = (error: Error) => reject(error);

        server.once('error', handleError);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', handleError);
            resolve();
        });
    });

    const address = server.address() as AddressInfo;

    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        async close() {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    };
}
