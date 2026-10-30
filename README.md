# ShutterBook

A responsive photography booking PWA prototype for web and mobile.

## Features

- Photography package selection (portrait, couples/engagement, events)
- Booking request form with date, time, venue, and client details
- Local browser storage for submitted requests
- Responsive layout and installable PWA manifest
- Service-worker caching for a basic offline shell
- Automatic deployment to GitHub Pages from `main`

> **Prototype note:** Booking requests are stored in the visitor's browser only. This project does not currently provide shared/cloud booking storage, email notifications, payments, authentication, or a photographer admin dashboard. Do not use it for production bookings until a backend and privacy/security review are added.

## Run locally

Open `index.html` in a browser, or serve this folder using a local static server. For full PWA install/offline testing, use `localhost` or HTTPS.

## Publish to GitHub Pages

1. Create a **public** GitHub repository named `shutterbook`.
2. Upload the contents of this project folder to the repository root (not the folder itself as a nested directory).
3. Ensure the default branch is `main`.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **GitHub Actions**.
6. Push to `main`, or manually run **Actions → Deploy ShutterBook to GitHub Pages → Run workflow**.
7. When the workflow succeeds, the site URL will be shown in the deployment job. For a public repo named `shutterbook`, it is typically `https://YOUR-GITHUB-USERNAME.github.io/shutterbook/`.

The workflow in `.github/workflows/deploy.yml` publishes the root static files to Pages.

## PWA install

Visit the deployed HTTPS site on a supported browser. Use the browser's **Install app** or **Add to Home Screen** option when offered.
