# Insighta Web Portal

Static browser portal for Insighta Labs+.

## Configuration

Deploy this folder as a static site. Point it to the live backend by opening the site once with an `api` query parameter:

```text
https://your-web-host.example/?api=https://your-backend.up.railway.app
```

The portal stores that backend URL in `localStorage` and uses it for login, session refresh, profile search, admin actions, and CSV export.

## Backend requirements

The backend must set these production variables:

```env
WEB_ORIGIN=https://your-web-host.example
CORS_ORIGIN=https://your-web-host.example
GITHUB_REDIRECT_URI=https://your-backend.up.railway.app/auth/github/callback
NODE_ENV=production
```

GitHub OAuth callback URL must match `GITHUB_REDIRECT_URI`.
