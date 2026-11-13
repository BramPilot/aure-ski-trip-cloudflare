# AuréSkiTrip 2027 — one-click Cloudflare edition

This repository contains the public AuréSkiTrip website and a secure committee dashboard powered by Cloudflare Workers and D1.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/BramPilot/aure-ski-trip-cloudflare)

## What is included

- Public website with the current fallback status **11/20**.
- Live participant counter based on confirmed participants in D1.
- Open/close registration from the dashboard.
- Editable target number, deadline and official booking link.
- Add, edit, cancel and delete participants.
- Publish, hide, edit and delete website announcements.
- First-visit password setup and a protected admin session using an HttpOnly cookie.
- Mobile-friendly dashboard at `/admin/`.

The database starts with eleven placeholder participants. Replace these records with the real names; do not add the same eleven people again, otherwise the public counter will increase above 11.

## One-click deployment

1. Click the **Deploy to Cloudflare** button supplied with this repository.
2. Log in to Cloudflare and approve the deployment.
3. Cloudflare automatically creates and connects the D1 database.
4. Open the new website and add `/admin/` to its address.
5. Choose the admin password on the first visit.

The tables and the 11/20 starting position are created automatically when the website first loads. No terminal, database ID, migration command or Cloudflare secret is required.

## Local testing

Run:

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler and add `/admin/` for the dashboard.

## Daily use

You do not need to redeploy for ordinary updates. Log in at `/admin/` to:

- switch registration open or closed;
- change the target number or booking link;
- replace the eleven placeholder participants with real participant details;
- add new participants or change their status;
- publish a message on the public homepage.

Only participants with status **Confirmed** count towards the public total. Pending and cancelled participants remain available in the dashboard but do not increase the counter.

## Security notes

- The password is salted and hashed before it is stored; the plain password is never saved.
- Keep the admin URL within the committee.
- The participant list is never returned by the public API.
- Visit `/admin/` immediately after the first deployment to claim the initial admin access.
- For additional protection, you can later place `/admin/*` behind Cloudflare Access.
