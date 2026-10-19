import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiHandler = (request: Request) => Promise<Response>;

export function createApiHandler(handler: ApiHandler): {
  (request: Request): Promise<Response>;
  (request: IncomingMessage, response: ServerResponse): Promise<void>;
} {
  async function apiHandler(request: Request): Promise<Response>;
  async function apiHandler(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void>;
  async function apiHandler(
    request: Request | IncomingMessage,
    response?: ServerResponse
  ): Promise<Response | void> {
    if (request instanceof Request) {
      return handler(request);
    }
    if (!response) {
      throw new Error('Falta la respuesta HTTP de Vercel.');
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined) {
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
      }

      const forwardedProto = request.headers['x-forwarded-proto'];
      const protocol = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : forwardedProto;
      const webRequest = new Request(
        `${protocol || 'https'}://${request.headers.host || 'localhost'}${request.url || '/'}`,
        {
          method: request.method,
          headers,
          body:
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : body,
        }
      );
      const webResponse = await handler(webRequest);
      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await webResponse.arrayBuffer()));
    } catch (error) {
      console.error('Error procesando una solicitud de API:', error);
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'Error interno del servidor.' }));
    }
  }

  return apiHandler;
}
