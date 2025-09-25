const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
  'access-control-max-age': '86400'
};

function applyCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function error(message, status = 400) {
  return applyCors(new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  }));
}

function metadataFromHeaders(headers) {
  const httpMetadata = {};
  const maybeSet = (targetKey, headerKey) => {
    const value = headers.get(headerKey);
    if (value) {
      httpMetadata[targetKey] = value;
    }
  };

  maybeSet('contentType', 'content-type');
  maybeSet('contentLanguage', 'content-language');
  maybeSet('contentDisposition', 'content-disposition');
  maybeSet('cacheControl', 'cache-control');
  maybeSet('contentEncoding', 'content-encoding');
  return Object.keys(httpMetadata).length ? httpMetadata : undefined;
}

function headersFromObject(object) {
  const headers = new Headers();
  if ('writeHttpMetadata' in object) {
    object.writeHttpMetadata(headers);
  }
  if (object.httpEtag) {
    headers.set('etag', object.httpEtag);
  }
  if (typeof object.size === 'number') {
    headers.set('content-length', object.size.toString());
  }
  return headers;
}

async function handleList(bucket, url) {
  const prefix = url.searchParams.get('prefix') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Number(limitParam), 1000) : undefined;

  const listResult = await bucket.list({ prefix, cursor, limit });

  const payload = {
    objects: listResult.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      etag: obj.httpEtag,
      customMetadata: obj.customMetadata ?? {},
      httpMetadata: obj.httpMetadata ?? {}
    })),
    delimitedPrefixes: listResult.delimitedPrefixes ?? [],
    truncated: listResult.truncated,
    cursor: listResult.cursor ?? null
  };

  return applyCors(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  }));
}

async function handleGet(bucket, key) {
  const object = await bucket.get(key);
  if (!object) {
    return error('Object not found', 404);
  }

  const headers = headersFromObject(object);
  const response = new Response(object.body, { status: 200, headers });
  return applyCors(response);
}

async function handleHead(bucket, key) {
  const object = await bucket.head(key);
  if (!object) {
    return error('Object not found', 404);
  }

  const headers = headersFromObject(object);
  const response = new Response(null, { status: 200, headers });
  return applyCors(response);
}

async function handlePut(bucket, key, request) {
  await bucket.put(key, request.body, {
    httpMetadata: metadataFromHeaders(request.headers)
  });

  const response = new Response(null, { status: 201, headers: { location: `/${encodeURIComponent(key)}` } });
  return applyCors(response);
}

async function handleDelete(bucket, key) {
  await bucket.delete(key);
  return applyCors(new Response(null, { status: 204 }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return applyCors(new Response(null, { status: 204 }));
    }

    const bucketBindingName = env.R2_BUCKET_BINDING;
    if (!bucketBindingName) {
      return error('Missing environment variable "R2_BUCKET_BINDING"', 500);
    }

    const bucket = env[bucketBindingName];
    if (!bucket) {
      return error(`R2 binding "${bucketBindingName}" not found`, 500);
    }

    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    if (!key && method !== 'GET') {
      return error('Object key is required', 400);
    }

    try {
      switch (method) {
        case 'GET':
          if (!key) {
            return handleList(bucket, url);
          }
          return handleGet(bucket, key);
        case 'HEAD':
          return handleHead(bucket, key);
        case 'PUT':
        case 'POST':
          return handlePut(bucket, key, request);
        case 'DELETE':
          return handleDelete(bucket, key);
        default:
          return error(`Method ${method} not allowed`, 405);
      }
    } catch (err) {
      console.error('R2 handler error', err);
      return error('Internal server error', 500);
    }
  }
};