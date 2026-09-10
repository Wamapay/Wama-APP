"use strict";
// Assembles bundle.js + tailwind-output.css (produced by `npm run build:css`
// and `npm run build:js`) into the final single-file index.html. Run via
// `npm run build`, which runs all three steps in order.
const fs = require("fs");
const path = require("path");

const bundle = fs.readFileSync(path.join(__dirname, "bundle.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "tailwind-output.css"), "utf8");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Admin Dashboard — Learn & Earn</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
// Set this to your deployed backend's API base URL before hosting, e.g.:
//   window.ADMIN_API_BASE = "https://api.yourdomain.com/api/v1";
// Defaults to a same-origin relative path if left unset.
window.ADMIN_API_BASE = "https://wama-app-production.up.railway.app/api/v1";
</script>
<script>
${bundle}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log("Built admin/index.html (" + html.length + " bytes)");
