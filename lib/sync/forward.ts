import { getConfig } from "../config";

export async function forwardToSync(
  request: Request,
  path: string,
): Promise<Response> {
  const target = new URL(path, `${getConfig().syncInternalUrl}/`);
  target.search = new URL(request.url).search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    cache: "no-store",
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function forwardHealthToSync(request: Request): Promise<Response> {
  try {
    return await forwardToSync(request, "/health");
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
