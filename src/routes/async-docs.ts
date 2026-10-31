import { Router } from 'express';

// ==================== ASSETS ====================

// Official AsyncAPI web component, pinned and loaded from jsDelivr so the backend needs no extra
// npm dependencies. The script is protected with Subresource Integrity.
const CDN_URL = 'https://cdn.jsdelivr.net';
const WEB_COMPONENT_URL = `${CDN_URL}/npm/@asyncapi/web-component@3.1.8/lib/asyncapi-web-component.js`;
const WEB_COMPONENT_INTEGRITY =
  'sha384-1lhhmwYf1Eif0PQgDyo9eNFJLiRmcSgsv4mkpEtxLPzd+gEPIjxuoEdCQq9PsSm5';
const STYLES_URL = `${CDN_URL}/npm/@asyncapi/react-component@3.1.8/styles/default.min.css`;

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nodus realtime API documentation</title>
</head>
<body>
  <asyncapi-component schemaUrl="/api/asyncapi.json" cssImportPath="${STYLES_URL}"></asyncapi-component>
  <script src="${WEB_COMPONENT_URL}" integrity="${WEB_COMPONENT_INTEGRITY}" crossorigin="anonymous" defer></script>
</body>
</html>
`;

// Helmet's default policy only allows same-origin scripts. This page also needs the pinned CDN and
// 'unsafe-eval': the AsyncAPI parser inside the web component compiles schemas with Ajv.
// The page is mounted in development only.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' ${CDN_URL} 'unsafe-eval'`,
  `style-src 'self' ${CDN_URL} 'unsafe-inline'`,
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

// ==================== ROUTER ====================

export const asyncApiDocsRouter = Router();

asyncApiDocsRouter.get('/', (_req, res) => {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.type('html').send(page);
});
