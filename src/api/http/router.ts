import type { Handler, HttpMethod, Next } from './http.types.js';
import { notFound } from '../../utils/errors.js';

type Route = { method: HttpMethod; path: string; handlers: Handler[] };

export class Router {
    private routes: Route[] = [];

    get(path: string, ...handlers: Handler[]) { this.routes.push({ method: 'GET', path, handlers }); }
    post(path: string, ...handlers: Handler[]) { this.routes.push({ method: 'POST', path, handlers }); }

    handler(): Handler {
        return async (request, result, next) => {
            const route = this.routes.find(r => r.method === request.method && r.path === request.url.pathname);

            if (!route)
                return next(notFound('Route not found', 'ROUTE_NOT_FOUND'));

            let i = 0;
            const run = async (error?: unknown) => {
                if (error)
                    return next(error);

                const currentHandler: Handler = route.handlers[i++];

                if (!currentHandler)
                    return;
                
                await currentHandler(request, result, run as Next);
            };

            await run();
        };
    }
}