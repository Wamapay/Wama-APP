# Learn & Earn — Main App (Frontend)

A single self-contained `index.html` (React via CDN, no build step required).

## Deploying

This is a static file — deploy it to any static host (GitHub Pages,
Netlify, Vercel, S3 + CloudFront, Nginx, etc.). There is nothing to build.

## Configuring the backend URL

Before this file loads, it reads `window.LEARN_AND_EARN_API_BASE` and
falls back to a same-origin relative `/api/v1` if that's not set. If your
backend is deployed on a different origin than this frontend, set the
variable in the `<head>` of `index.html`, before the main `<script>` tag:

```html
<script>
  window.LEARN_AND_EARN_API_BASE = "https://api.yourdomain.com/api/v1";
</script>
```

## Backend CORS

Whatever origin you deploy this file to must be added to the backend's
`FRONTEND_URL` (or `CORS_EXTRA_ORIGINS`) environment variable — see
`../backend/README.md`.

## Paystack callback

The checkout flow redirects to Paystack and back to
`<this-origin>/#/checkout/callback`. Set the backend's
`PAYSTACK_CALLBACK_URL` to that exact URL once you know your deployed
domain.
