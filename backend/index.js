import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { query, closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import authMiddleware from "./middleware/auth.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const VALID_STATUSES = ["Pending", "Completed", "Expired"];
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const ID_REGEX = /^\d{1,18}$/;

// ---------------- Startup checks ----------------
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. See .env.example. Exiting.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. See .env.example. Exiting.");
  process.exit(1);
}

const app = express();

// ---------------- CORS ----------------
// FRONTEND_URL = the exact origin of your deployed frontend (comma-separate several).
// Example: https://my-todo-frontend.onrender.com  (no trailing slash, no path)
// Outside production, localhost origins are also allowed for local development.
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

if (IS_PRODUCTION && allowedOrigins.length === 0) {
  console.warn("FRONTEND_URL is not set: browser requests from your frontend will be blocked by CORS.");
}

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = not a browser (curl, health checks): allow.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!IS_PRODUCTION && isLocalOrigin(origin)) return callback(null, true);
      return callback(null, false); // no CORS headers -> the browser blocks it
    }
  })
);
app.use(express.json({ limit: "100kb" }));

// ---------------- Helpers ----------------
// Shapes a DB row like the original API response so the frontend keeps working.
const formatTodo = (row) => ({
  _id: String(row.id),
  title: row.title,
  description: row.description,
  status: row.status,
  createdBy: String(row.user_id),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const formatUser = (row) => ({ id: String(row.id), name: row.name, email: row.email });

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

// A password hash to compare against when the email doesn't exist,
// so login takes about the same time either way.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// ---------------- Health check ----------------
app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    return res.status(200).json({ status: "ok", database: "up" });
  } catch (error) {
    console.error("Health check: database unreachable:", error.message);
    return res.status(503).json({ status: "error", database: "down" });
  }
});

// Serve the frontend and API from the same Render Web Service. This avoids
// hardcoding a separate backend hostname in browser JavaScript.
const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend");
app.use(express.static(frontendDirectory));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDirectory, "index.html"));
});

// ---------------- signup route with password hashing ----------------
app.post("/user/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!isNonEmptyString(name) || !isNonEmptyString(email) || typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Please provide name, email, and password." });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or fewer." });
    }
    if (cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: "Please provide a valid email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }
    // bcrypt only uses the first 72 bytes of a password.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be 72 bytes or fewer." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // The unique index on lower(email) is the real duplicate protection (no race conditions).
    await query("INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)", [
      cleanName,
      cleanEmail,
      hashedPassword
    ]);

    return res.status(201).json({ message: "User registered successfully. Please log in." });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "A user with this email already exists." });
    }
    console.error("Signup error:", error.message);
    return res.status(500).json({ message: "Server error during signup." });
  }
});

// ---------------- login route with jwt token generation ----------------
app.post("/user/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isNonEmptyString(email) || typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Please provide email and password." });
    }

    const result = await query("SELECT id, name, email, password_hash FROM users WHERE lower(email) = $1", [
      email.trim().toLowerCase()
    ]);
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: String(user.id), name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: formatUser(user)
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Server error during login." });
  }
});

// ---------------- create todo route with jwt token verification ----------------
app.post("/todo/create", authMiddleware, async (req, res) => {
  try {
    const { title, description, status } = req.body || {};

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ message: "Title is required." });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ message: "Title must be 200 characters or fewer." });
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
      return res.status(400).json({ message: "Description must be text." });
    }
    if (description && description.trim().length > 2000) {
      return res.status(400).json({ message: "Description must be 2000 characters or fewer." });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    // user_id comes from the verified JWT only.
    const result = await query(
      `INSERT INTO todos (user_id, title, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, title.trim(), (description || "").trim(), status || "Pending"]
    );

    return res.status(201).json({ message: "Todo created successfully.", todo: formatTodo(result.rows[0]) });
  } catch (error) {
    if (error.code === "23503") {
      // Foreign key violation: the user in the token no longer exists.
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    console.error("Create todo error:", error.message);
    return res.status(500).json({ message: "Server error while creating todo." });
  }
});

// ---------------- get all todos route with jwt token verification ----------------
app.get("/todo/get", authMiddleware, async (req, res) => {
  try {
    const result = await query("SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at DESC, id DESC", [
      req.user.id
    ]);
    return res.status(200).json({ todos: result.rows.map(formatTodo) });
  } catch (error) {
    console.error("Get todos error:", error.message);
    return res.status(500).json({ message: "Server error while fetching todos." });
  }
});

// ---------------- update todo ----------------
app.put("/todo/update/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body || {};

    if (!ID_REGEX.test(id)) {
      return res.status(404).json({ message: "Todo not found." });
    }
    if (title !== undefined && !isNonEmptyString(title)) {
      return res.status(400).json({ message: "Title cannot be empty." });
    }
    if (title !== undefined && title.trim().length > 200) {
      return res.status(400).json({ message: "Title must be 200 characters or fewer." });
    }
    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({ message: "Description must be text." });
    }
    if (description !== undefined && description.trim().length > 2000) {
      return res.status(400).json({ message: "Description must be 2000 characters or fewer." });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    // WHERE id AND user_id: a user can only ever touch their own rows.
    // A missing field (null) keeps the current value.
    const result = await query(
      `UPDATE todos
          SET title       = COALESCE($1, title),
              description = COALESCE($2, description),
              status      = COALESCE($3, status),
              updated_at  = now()
        WHERE id = $4 AND user_id = $5
        RETURNING *`,
      [
        title === undefined ? null : title.trim(),
        description === undefined ? null : description.trim(),
        status === undefined ? null : status,
        id,
        req.user.id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Todo not found." });
    }

    return res.status(200).json({ message: "Todo updated successfully.", todo: formatTodo(result.rows[0]) });
  } catch (error) {
    console.error("Update todo error:", error.message);
    return res.status(500).json({ message: "Server error while updating todo." });
  }
});

// ---------------- delete todo ----------------
app.delete("/todo/delete/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ID_REGEX.test(id)) {
      return res.status(404).json({ message: "Todo not found." });
    }

    const result = await query("DELETE FROM todos WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Todo not found." });
    }

    return res.status(200).json({ message: "Todo deleted successfully." });
  } catch (error) {
    console.error("Delete todo error:", error.message);
    return res.status(500).json({ message: "Server error while deleting todo." });
  }
});

// ---------------- Error handling ----------------
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body must be valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large." });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Something went wrong on the server." });
});

// ---------------- Start ----------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries a few times because the database can take a moment to become reachable.
async function initDatabase(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await runMigrations();
      console.log("✅ PostgreSQL connected, schema is up to date");
      return;
    } catch (err) {
      console.error(`❌ Database setup failed (attempt ${i}/${attempts}): ${err.message}`);
      if (i === attempts) throw err;
      await sleep(i * 2000);
    }
  }
}

async function start() {
  try {
    await initDatabase();
  } catch {
    console.error("Could not set up the database. Check DATABASE_URL. Exiting.");
    process.exit(1);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
