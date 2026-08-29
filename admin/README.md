# Learn & Earn — Admin Dashboard

A separate React app from the main frontend, sharing the same backend.
`index.html` is a pre-built, self-contained static file — deploy it as-is
to any static host, no build step required to just deploy.

## Deploying the pre-built file

`index.html` is ready to deploy directly (GitHub Pages, Netlify, Vercel,
S3, Nginx, etc.) — the same way as `../frontend`.

## Configuring the backend URL

Set `window.ADMIN_API_BASE` before the main `<script>` tag in
`index.html` if the backend is on a different origin (defaults to a
same-origin relative `/api/v1`):

```html
<script>
  window.ADMIN_API_BASE = "https://api.yourdomain.com/api/v1";
</script>
```

Add this dashboard's deployed origin to the backend's
`ADMIN_FRONTEND_URL` environment variable so CORS allows it.

## Rebuilding from source

The real source is `src/AdminDashboard.jsx` (React + Tailwind utility
classes + recharts + lucide-react). To change the dashboard and rebuild
`index.html`:

```bash
npm install
npm run build
```

This runs three steps (also runnable individually):
- `build:css` — compiles `tailwind-input.css` into a real, minified
  stylesheet scanning `src/**/*.jsx` for the actual classes in use (no
  `cdn.tailwindcss.com` script — that's a production warning Paystack/
  browsers surface, avoided here entirely).
- `build:js` — bundles `src/entry.jsx` (and everything it imports) with
  esbuild into `bundle.js`.
- `build.js` — assembles the compiled CSS + JS into the final
  `index.html`.

## Authentication

This dashboard authenticates against the same real backend `/auth/login`
endpoint as the main app, and shares the same localStorage token keys —
an account must have `role: "ADMIN"` or `"SUPER_ADMIN"` on the backend to
get past login here; that role check happens server-side on every
request, never trusted from this frontend alone.
