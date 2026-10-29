# To-Do List App (Node.js + Express + PostgreSQL)

A task manager where users sign up, log in, and manage their own to-do cards.

## Features
- Register and log in (passwords hashed with bcrypt, sessions via JWT)
- Create, view, edit, delete tasks, and change status (Pending / Completed / Expired)
- Filter tasks by status
- Every user only ever sees and changes their own tasks (enforced on the server)

## Technology stack
- Frontend: plain HTML, CSS, JavaScript (no build step)
- Backend: Node.js, Express 5
- Database: PostgreSQL via the `pg` package
- Auth: JWT (`jsonwebtoken`) + `bcryptjs`

## Project structure
```
.
├── .gitignore
├── render.yaml              # Render Blueprint: web service + PostgreSQL
├── README.md
├── backend/
│   ├── index.js              # Express server and all API routes
│   ├── package.json
│   ├── .env.example          # Placeholder environment variables
│   ├── db/
│   │   ├── schema.sql        # Tables, constraints, indexes (safe to re-run)
│   │   ├── migrate.js        # Applies schema.sql (runs automatically on start)
│   │   └── pool.js           # PostgreSQL connection pool (reads DATABASE_URL)
│   ├── middleware/auth.js    # Verifies the JWT
│   └── scripts/smoke-test.js # End-to-end API test (needs a real database)
└── frontend/
    ├── index.html, login.html, signup.html, dashboard.html
    ├── css/style.css
    └── js/
        ├── config.js         # Same-origin API in production; localhost for development
        ├── auth.js
        └── todo.js
```

## API
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/user/signup` | no | Register |
| POST | `/user/login` | no | Log in, returns `token` |
| POST | `/todo/create` | yes | Create a task |
| GET | `/todo/get` | yes | List your tasks |
| PUT | `/todo/update/:id` | yes | Edit a task / change status |
| DELETE | `/todo/delete/:id` | yes | Delete a task |
| GET | `/health` | no | Health check (checks the database) |

Authenticated routes need the header `Authorization: Bearer <token>`.

## Environment variables (backend)
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Long random string. The server refuses to start without it |
| `JWT_EXPIRES_IN` | no | Token lifetime, e.g. `7d` (default `7d`, same as before) |
| `PORT` | no | Render sets it; default 5000 locally |
| `FRONTEND_URL` | in production | Exact frontend origin for CORS, no trailing slash |
| `NODE_ENV` | recommended | `production` on Render (disables the localhost CORS allowance) |
| `DATABASE_SSL` | no | `true`/`false` to force SSL. Unset = automatic (SSL for remote hosts, off for localhost and Render's Internal URL) |

Generate a JWT secret:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
(On a phone without Node: use your password manager's generator for a random 64-character string.)

## Local setup
1. Install Node.js 18+ and PostgreSQL.
2. Create a database: `createdb todos`
3. ```
   cd backend
   cp .env.example .env      # then edit .env: DATABASE_URL and JWT_SECRET
   npm install
   npm start
   ```
   The tables are created automatically on startup (or run `npm run migrate`).
4. Open `frontend/index.html` with a local web server, e.g. `cd frontend && npx serve` (or VS Code Live Server).
   On `localhost` the frontend automatically talks to `http://localhost:5000`.

## Database
`backend/db/schema.sql` creates:
- `users` — id, name, email, password_hash, timestamps. A unique index on `lower(email)` prevents duplicate accounts.
- `todos` — id, `user_id` (foreign key to users, `ON DELETE CASCADE`), title, description, status (CHECK: Pending/Completed/Expired), timestamps. Index on `(user_id, created_at DESC)`.

The migration only uses `CREATE ... IF NOT EXISTS`, so restarting never duplicates tables or deletes data. It runs in a transaction with an advisory lock.
Deleting a user also deletes their tasks (cascade).

Note: existing MongoDB data is **not** migrated automatically. Users must register again.

## Deploy on Render (Blueprint)

This project includes `render.yaml`. The backend serves both the frontend pages and API from the same Render Web Service, so there is no separate frontend URL or hardcoded backend URL to replace. API requests use the same origin in production.

1. Push the project root (the folder containing `render.yaml`) to GitHub.
2. Open the Render Dashboard and choose **New + → Blueprint**. Connect the GitHub repository containing `render.yaml`.
3. Review the Blueprint resources. It defines one Node.js Web Service and one PostgreSQL database. Check Render's current database plan availability, limits, and pricing before applying.
4. Apply the Blueprint. Render supplies `DATABASE_URL` from the PostgreSQL resource and generates `JWT_SECRET` automatically.
5. Wait for the web service deployment to finish. Open the service URL. The website should load directly.
6. Open `<your-render-service-url>/health`; a healthy deployment should return `{"status":"ok","database":"up"}`.
7. Test signup, login, and task creation/editing/deletion.

If you prefer to create services manually, create a PostgreSQL database and a Web Service with root directory `backend`, build command `npm install`, and start command `npm start`; set `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, and `NODE_ENV=production`. The same service must be able to serve the `frontend` directory located beside `backend`.

### Why there is no production API URL placeholder

The frontend and API are hosted by the same web service. In production `API_BASE_URL` is an empty string, so requests such as `/user/login` and `/todo/get` go to the current website's origin. Locally, the frontend uses `http://localhost:5000`. No manual URL edit is required after deployment.

## Testing the deployment
1. Open the frontend URL → Sign up → you should be redirected to login.
2. Log in → dashboard appears.
3. Add a task, change its status, edit it, delete it.
4. Refresh the page and log in again: your tasks are still there (stored in PostgreSQL).
5. Optional automated check (needs a running backend + database):
   `cd backend && API_URL=https://YOUR-BACKEND.onrender.com FRONTEND_URL=https://YOUR-FRONTEND.onrender.com npm run smoke-test`

## Troubleshooting
- **"Could not reach the server"**: the backend is asleep/starting or the service failed to start (free plans may take ~1 minute to wake). Check `/health`.
- **CORS error in the browser console**: `FRONTEND_URL` must exactly match the frontend origin (https, no trailing slash, no path). Redeploy the backend after changing it.
- **Backend exits at startup**: check Render logs. `JWT_SECRET is not set` / `DATABASE_URL is not set` / `Database setup failed` tell you which variable is missing or wrong.
- **SSL errors connecting to the database**: use the Internal URL, or set `DATABASE_SSL=true` when using the External URL.
- **`/health` returns 503**: the backend can't reach the database; check `DATABASE_URL` and that the database is *Available*.
- **Logged out unexpectedly after the migration**: old MongoDB tokens are rejected by design; log in again.

## Security notes
- All SQL uses parameterized queries.
- The user id is taken only from the verified JWT.
- No rate limiting is included; consider adding it before heavy public use.
