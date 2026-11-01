/**
 * Cloudflare Pages Function: Reverse-proxies /api/* requests to the Render backend.
 * This guarantees the browser treats the frontend and API as the exact same origin,
 * enabling first-party httpOnly cookies with zero CORS or third-party cookie blocking.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Read the Render backend URL from Cloudflare environment variable BACKEND_URL
  const backend = env.BACKEND_URL;
  if (!backend) {
    return new Response(
      JSON.stringify({ error: "BACKEND_URL environment variable is not configured in Cloudflare Pages." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const targetUrl = new URL(url.pathname + url.search, backend);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("x-forwarded-host", url.hostname);
  forwardHeaders.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const modifiedRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: forwardHeaders,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });

  return fetch(modifiedRequest);
}

