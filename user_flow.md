# User Flow: From a Built App on a Laptop to an Installed PWA on a Phone

This is the install path the v0.2 spec is built around. One command on the
laptop, one QR scan on the phone.

## One-time setup on the laptop

Install three things (only needed the first time, ever):

```powershell
winget install OpenJS.NodeJS
winget install Git.Git
winget install Cloudflare.cloudflared
```

No accounts, no logins required.

## Per-app, per-phone

On the laptop:

```powershell
git clone <repo-url>
cd <repo-name>
npm install
npm run build
npm run serve:phone
```

`npm run serve:phone`:

1. Starts the production preview on `http://localhost:4173`.
2. Brings up a Cloudflare tunnel to that port.
3. Prints a QR code in the terminal whose payload is the public
   `https://*.trycloudflare.com` URL, and prints the URL underneath in
   case the QR doesn't scan.

Keep the terminal open through the install — closing it tears down the
tunnel before the phone has finished caching the app.

## On the phone

4. Open the **camera** app. Android 8+ / iOS 11+ recognise QR codes
   natively and offer to open the URL.
5. Tap the prompt. The phone's default browser opens the page.

   **Use the right browser:**
   - **Android:** Chrome.
   - **iPhone:** Safari. (Chrome on iOS cannot install PWAs — make sure
     the link opens in Safari, not Chrome.)
6. Wait for the page to load fully.
7. Install:
   - **Android Chrome:** an "Install app" banner usually appears. Tap
     it. If it doesn't appear, menu (⋮) → *Install app* or
     *Add to Home screen*.
   - **iOS Safari:** **Share** (square with up-arrow) → scroll →
     *Add to Home Screen* → *Add*.
8. The app icon is now on the home screen. Tap it to launch.

Once the install completes, the service worker has cached the bundle.
The app:

- works offline,
- survives Ctrl+C on the laptop,
- survives the laptop being shut down,
- survives the phone disconnecting from Wi-Fi.

Data lives on the phone (IndexedDB).

## Barriers and gotchas

1. **`cloudflared` must be on PATH.** `serve:phone` shells out to it.
   `winget install Cloudflare.cloudflared` is the easiest way; restart
   the shell afterwards.
2. **iPhone Chrome can't install PWAs.** Make the user open the URL in
   Safari specifically.
3. **The laptop terminal must stay up until the install finishes.** If
   you Ctrl+C while the phone is still fetching the bundle, the install
   fails silently and the icon ends up broken.
4. **Tunnel URLs are one-shot.** Every `serve:phone` run gets a fresh
   `trycloudflare.com` URL. So:
   - First install: fine.
   - Reinstalling on the same phone later: you get a different URL,
     which is technically a different origin, which means the new
     install has its own empty IndexedDB. The old install (if still
     present) keeps its data, but no data flows between them.
5. **Networks that block `trycloudflare.com`.** Some corporate /
   school / captive-portal Wi-Fi blocks the trycloudflare domain. If
   the phone can't load the page, switch to mobile data or a different
   Wi-Fi.
6. **HTTPS is required for install.** cloudflared gives HTTPS for free.
   A raw LAN address like `http://192.168.x.x:4173` will *not* show an
   install prompt — always go through the tunnel.
7. **`npm run dev` won't work for install.** The service worker is
   disabled in dev (`devOptions.enabled: false`). Always use the build
   + `serve:phone` flow.
8. **iOS storage is sandboxed per home-screen install.** The PWA's
   IndexedDB is separate from Safari's. This is the intended app-like
   isolation, but worth knowing.

## Realistic end-to-end time

After the one-time `winget` installs: roughly **2 minutes** from
`git clone` to a tappable icon on the phone. Most of that is
`npm install`.
