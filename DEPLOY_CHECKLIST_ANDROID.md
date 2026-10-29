# Beginner checklist: GitHub + Render from an Android phone

Use Chrome. For desktop-only pages, tap ⋮ → **Desktop site**.

## A. Safety first
- [ ] The original project contained a `.env` with real MongoDB/JWT values. It is removed from this ZIP, but if those values were ever pushed anywhere, **change your MongoDB password and treat the old JWT secret as compromised**.

## B. Put the code on GitHub
- [ ] Sign in at github.com → **+ → New repository** → name it (e.g. `todos`) → Create.
- [ ] Unzip the project on your phone (Files app → tap the ZIP → Extract).
- [ ] In the repo tap **Add file → Upload files**, select the extracted `backend` and `frontend` folders plus `.gitignore` and `README.md`. (If folders can't be selected, use GitHub's web editor to create files one by one, or the free **Termux** app with `git`.)
- [ ] Confirm there is **no `.env` file** and no `node_modules` in the repo → **Commit changes**.

## C. Deploy with the Render Blueprint
- [ ] Open dashboard.render.com → **New + → Blueprint**.
- [ ] Connect the GitHub repository containing `render.yaml` at the repository root.
- [ ] Review the Blueprint: it defines a Node.js Web Service and a PostgreSQL database. Check Render's current database plan, limits, and pricing before applying.
- [ ] Apply the Blueprint. It configures `DATABASE_URL` from the database and generates `JWT_SECRET` automatically.
- [ ] Wait for deployment to finish. Open the Web Service URL and confirm the website loads.
- [ ] Open `<your-service-url>/health` → expect `{"status":"ok","database":"up"}`.

## D. Why no URL replacement is needed
- [ ] The same Render Web Service serves both the frontend and API. `frontend/js/config.js` uses relative API paths in production, so you do **not** need to paste a backend URL into the frontend.

## H. Test
- [ ] Open the frontend URL → Sign up → Log in → add, edit, change status, delete a task → refresh → log in again and confirm data persists.
- [ ] If something fails, see the Troubleshooting section in `README.md` and check the Render **Logs** tab.
