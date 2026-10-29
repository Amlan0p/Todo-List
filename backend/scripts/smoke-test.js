// End-to-end smoke test. Run against a RUNNING backend that is connected to a real PostgreSQL database:
//   API_URL=http://localhost:5000 npm run smoke-test
// It creates two throwaway users (random emails). It never prints tokens or passwords.
const API = (process.env.API_URL || "http://localhost:5000").replace(/\/+$/, "");
const stamp = Date.now();
const userA = { name: "Test A", email: `a${stamp}@example.com`, password: "secret123" };
const userB = { name: "Test B", email: `b${stamp}@example.com`, password: "secret456" };

let failures = 0;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures++;
};

async function call(method, path, { body, token, origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data, headers: res.headers };
}

const health = await call("GET", "/health");
check("health endpoint returns 200", health.status === 200);

check("signup creates user (201)", (await call("POST", "/user/signup", { body: userA })).status === 201);
check("second user signup (201)", (await call("POST", "/user/signup", { body: userB })).status === 201);
check("duplicate signup rejected (409)", (await call("POST", "/user/signup", { body: userA })).status === 409);
check("duplicate with different case rejected (409)",
  (await call("POST", "/user/signup", { body: { ...userA, email: userA.email.toUpperCase() } })).status === 409);
check("signup missing fields (400)", (await call("POST", "/user/signup", { body: { email: "x@y.com" } })).status === 400);
check("signup short password (400)", (await call("POST", "/user/signup", { body: { ...userA, email: `c${stamp}@example.com`, password: "123" } })).status === 400);
check("signup bad email (400)", (await call("POST", "/user/signup", { body: { name: "x", email: "nope", password: "secret123" } })).status === 400);

const loginA = await call("POST", "/user/login", { body: { email: userA.email, password: userA.password } });
check("login with valid credentials (200 + token)", loginA.status === 200 && !!loginA.data?.token);
check("wrong password rejected (401)", (await call("POST", "/user/login", { body: { email: userA.email, password: "wrong" } })).status === 401);
check("unknown email rejected (401)", (await call("POST", "/user/login", { body: { email: "nobody@example.com", password: "x" } })).status === 401);
const tokenA = loginA.data?.token;
const tokenB = (await call("POST", "/user/login", { body: { email: userB.email, password: userB.password } })).data?.token;

check("GET /todo/get without token (401)", (await call("GET", "/todo/get")).status === 401);
check("GET /todo/get with garbage token (401)", (await call("GET", "/todo/get", { token: "abc.def.ghi" })).status === 401);

const created = await call("POST", "/todo/create", { token: tokenA, body: { title: "Task A", description: "d" } });
check("create todo (201)", created.status === 201 && created.data?.todo?._id);
const id = created.data?.todo?._id;
check("create without title (400)", (await call("POST", "/todo/create", { token: tokenA, body: {} })).status === 400);
check("create with bad status (400)", (await call("POST", "/todo/create", { token: tokenA, body: { title: "x", status: "Nope" } })).status === 400);

const listA = await call("GET", "/todo/get", { token: tokenA });
check("user A sees own todo", listA.data?.todos?.some((t) => t._id === id));
const listB = await call("GET", "/todo/get", { token: tokenB });
check("user B does not see user A's todo", !listB.data?.todos?.some((t) => t._id === id));

check("user B cannot update A's todo (404)", (await call("PUT", `/todo/update/${id}`, { token: tokenB, body: { title: "hacked" } })).status === 404);
check("user B cannot delete A's todo (404)", (await call("DELETE", `/todo/delete/${id}`, { token: tokenB })).status === 404);
check("body userId/createdBy is ignored",
  (await call("POST", "/todo/create", { token: tokenB, body: { title: "B task", createdBy: "1", user_id: 1 } })).data?.todo?.createdBy
  !== created.data?.todo?.createdBy);

const upd = await call("PUT", `/todo/update/${id}`, { token: tokenA, body: { status: "Completed" } });
check("owner can change status (200)", upd.status === 200 && upd.data?.todo?.status === "Completed" && upd.data?.todo?.title === "Task A");
check("update with invalid status (400)", (await call("PUT", `/todo/update/${id}`, { token: tokenA, body: { status: "Nope" } })).status === 400);
check("update with non-numeric id (404)", (await call("PUT", "/todo/update/abc", { token: tokenA, body: { title: "x" } })).status === 404);
check("owner can delete (200)", (await call("DELETE", `/todo/delete/${id}`, { token: tokenA })).status === 200);
check("deleting again (404)", (await call("DELETE", `/todo/delete/${id}`, { token: tokenA })).status === 404);

if (process.env.FRONTEND_URL) {
  const allowed = await call("GET", "/health", { origin: process.env.FRONTEND_URL.split(",")[0].trim() });
  check("CORS allows FRONTEND_URL", !!allowed.headers.get("access-control-allow-origin"));
  const blocked = await call("GET", "/health", { origin: "https://evil.example" });
  check("CORS blocks other origins", !blocked.headers.get("access-control-allow-origin"));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
