# Insighta Web Portal

Static browser portal for Insighta Labs+.

## Configuration

Deploy the `public` folder as a static site. Point it to the live backend by opening the site once with an `api` query parameter:

```text
https://your-web-host.example/?api=https://your-backend.up.railway.app
```

The portal only accepts `https:` URLs, plus `http://localhost` for development. It stores the backend URL in `localStorage`, shows it in the header, and uses it for login, session refresh, profile search, admin actions, and CSV export.

## Security

The session lives in HTTP-only cookies set by the backend. The portal reads the CSRF token from `GET /api/v1/session/me` (or from `POST /auth/refresh`), keeps it in memory, and sends it in `X-CSRF-Token` on requests that change data. API data is rendered with `textContent`, never as HTML.

## Tests

Requires Node.js 22.

```bash
npm install
npx playwright install chromium
npm test
```

The Playwright tests load the real page against a simulated backend. They cover XSS, CSRF, CSV export errors, and the `api` parameter.

## Backend requirements

The backend must set these production variables:

```env
WEB_ORIGIN=https://your-web-host.example
CORS_ORIGIN=https://your-web-host.example
GITHUB_REDIRECT_URI=https://your-backend.up.railway.app/auth/github/callback
```

GitHub OAuth callback URL must match `GITHUB_REDIRECT_URI`.
