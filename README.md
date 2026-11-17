# Kenya Agro-Advisory

A prototype web app for submitting farm details and reviewing rule-based farming advice. Farmers can create an account, submit a request, and see advice after an extension officer reviews it.

> **Prototype only:** crop rules, locations, and advice are fictional demo data. Do not use this app to make real farming decisions.

## Features

- Farmer sign-up, login, and consent flow.
- Farm advice requests using crop, county, zone, soil, and farming stage.
- Rule checks that stop when advice is expired, conflicting, or not covered.
- Extension-officer review before advice is shown to a farmer.
- Local JSON storage; no third-party packages are required.

## Requirements

- Node.js 18 or newer
- A modern web browser

## Run locally

1. Install Node.js from [nodejs.org](https://nodejs.org/).
2. Open this project folder in VS Code, or open a terminal in the folder.
3. Start the server:

   ```powershell
   npm start
   ```

4. Visit [http://localhost:3000](http://localhost:3000).
5. Stop the server with `Ctrl+C`.

The server creates `data/db.json` when it first runs. This file stores local demo data and is not included in the repository.

## Demo accounts

- **Farmer:** create an account from the sign-up page.
- **Extension officer:** `officer@demo.local` / `Officer123`

The officer account is for local demonstration only. Do not use its example password in a deployed application.

## Example rule checks

Sign in as a farmer, give consent, and submit one of these examples:

| Crop | County | Zone | Soil | Stage | Expected result |
|---|---|---|---|---|---|
| Beans | Kakamega | Upper Midland | Loam | Planting | Sent for officer review |
| Tea | Nakuru | Upper Highland | Loam | Harvest | Stopped because the rule is expired |
| Potatoes | Nakuru | Upper Highland | Loam | Vegetative growth | Stopped because rules conflict |
| Any other combination | — | — | — | — | Stopped because the request is not covered |

## Project structure

| Path | Purpose |
|---|---|
| `server.js` | HTTP server, authentication, API, and local data storage |
| `rules.js` | Fictional demo rules and rule checks |
| `public/` | HTML, CSS, and browser-side JavaScript |
| `public/index.html` | Home page |
| `public/login.html` and `public/signup.html` | Account pages |
| `public/app.html` | Farmer and officer dashboard |
| `data/db.json` | Created locally at runtime; not tracked in this repository |

## Limitations

This is a local prototype, not a production service. It has no HTTPS, weather, SMS, or market integrations. Authentication sessions reset when the server restarts, and the demo data and rules are not suitable for real-world use.
