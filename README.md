# Farm Advisory

A small web app where farmers can send supported farm questions and an extension officer reviews each request before writing advice.

This is a demonstration project. It does not contain verified agricultural advice and should not be used as a substitute for a qualified local extension officer.

## Run it

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Start the app:

   ```sh
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

The app uses only Node.js built-in modules; no package installation is needed. Stop it with `Ctrl+C`.

## Try the app

- Create a farmer account and agree to share the request with an officer.
- Submit **Beans / Kakamega / Planting** or **Maize / Nakuru / Planting** to create a request for review.
- Other available combinations are marked as not covered by this demo.
- Sign in as the demo officer with `officer@demo.local` and `Officer123`.
- The officer can enter reviewed advice and approve, or decline the request with a reason.
- Approved advice appears in the farmer's request list.

You can change the demo officer credentials with the `OFFICER_EMAIL` and `OFFICER_PASSWORD` environment variables before the first run. Accounts and requests are stored locally in `data/db.json`; login sessions end when the server restarts.

## Test

Run the rule checks with:

```sh
npm test
```

## Files

- `server.js` — web server, accounts, requests, and officer reviews.
- `rules.js` — the small set of supported demo combinations.
- `public/` — the page, styles, and browser behavior.
- `data/db.json` — created automatically when the server starts.
