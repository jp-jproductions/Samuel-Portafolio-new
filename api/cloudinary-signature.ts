import { createHash, randomUUID } from 'node:crypto';
import { createApiHandler } from '../api-adapter.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function getCloudinaryCredentials(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
  if (cloudinaryUrl) {
    try {
      const parsedUrl = new URL(cloudinaryUrl);
      const apiKey = decodeURIComponent(parsedUrl.username);
      const apiSecret = decodeURIComponent(parsedUrl.password);
      const cloudName = parsedUrl.hostname;

      if (
        parsedUrl.protocol !== 'cloudinary:' ||
        !cloudName ||
        !apiKey ||
        !apiSecret
      ) {
        return null;
      }
      return { cloudName, apiKey, apiSecret };
    } catch {
      return null;
    }
  }

  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } =
    process.env;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    return new Response(
      JSON.stringify({
        error:
          'Cloudinary no está configurado correctamente. Define CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el entorno del servidor.',
      }),
      { status: 503, headers: JSON_HEADERS }
    );
  }
  const { cloudName, apiKey, apiSecret } = credentials;

  try {
    const body = (await request.json()) as { resourceType?: unknown };
    if (body.resourceType !== 'image' && body.resourceType !== 'video') {
      return new Response(JSON.stringify({ error: 'Tipo de archivo no permitido' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const params = {
      folder: 'portfolio-assets',
      public_id: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    };
    const paramsToSign = Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');
    const signature = createHash('sha1')
      .update(`${paramsToSign}${apiSecret}`)
      .digest('hex');

    return new Response(
      JSON.stringify({
        cloudName,
        apiKey,
        resourceType: body.resourceType,
        ...params,
        signature,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error) {
    console.error('No se pudo generar una firma de Cloudinary:', error);
    return new Response(JSON.stringify({ error: 'Solicitud de firma inválida' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
}

export const config = { api: { bodyParser: false } };

export default createApiHandler(handler);
