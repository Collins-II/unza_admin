import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import dns from "node:dns";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { encode } = require("next-auth/jwt");
const base = process.env.LOCAL_TEST_URL || "http://localhost:3100";
const url = new URL(base);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || process.env.ALLOW_LOCAL_AUTH_SMOKE !== "1") {
  throw new Error("This test creates a temporary staff account. Set ALLOW_LOCAL_AUTH_SMOKE=1 and use a local test server only.");
}
const jar = new Map();
const request = async (path, options = {}, cookies = jar) => {
  const response = await fetch(`${base}${path}`, {
    ...options, redirect: "manual",
    headers: { ...options.headers, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
  });
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0];
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return { status: response.status, data: await response.json() };
};
const password = randomBytes(24).toString("base64url");
const staffId = `SMOKE-${randomBytes(8).toString("hex").toUpperCase()}`;
let createdId;

try {
  let connected = false;
  for (const resolver of [["8.8.8.8", "8.8.4.4"], ["1.1.1.1", "1.0.0.1"]]) {
    dns.setServers(resolver);
    try {
      await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
      connected = true;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("querySrv") || !error.message.includes("ECONNREFUSED")) throw error;
    }
  }
  if (!connected) throw new Error("Database connection failed.");
  const users = mongoose.connection.db.collection("users");
  const admin = await users.findOne({ role: "admin", status: "active" }, { projection: { _id: 1 } });
  assert.ok(admin, "An active test administrator is required.");
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  assert.ok(secret, "Authentication secret is required.");
  const adminJar = new Map([["next-auth.session-token", await encode({
    secret, token: { sub: String(admin._id), role: "admin" }, maxAge: 300,
  })]]);
  const sendAdmin = (path, method, data) => request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }, adminJar);
  const created = await sendAdmin("/api/admin/users", "POST", {
    staffId, name: "Temporary authentication smoke test", email: `${staffId.toLowerCase()}@example.test`, role: "staff", password,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  createdId = new mongoose.Types.ObjectId(created.data.user.id);
  const login = async (candidate) => {
    const csrf = await request("/api/auth/csrf");
    return request("/api/auth/callback/credentials", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, studentId: staffId, password: candidate, callbackUrl: `${base}/admin`, json: "true" }).toString(),
    });
  };
  await login(password);
  assert.equal((await request("/api/auth/session")).data.user?.role, "staff", "Staff login failed.");
  assert.equal((await request("/api/admin/courses")).status, 200);
  assert.equal((await sendAdmin("/api/admin/users", "PATCH", { id: String(createdId), status: "inactive" })).status, 200);
  assert.equal((await request("/api/admin/courses")).status, 401, "Existing session must lose access immediately.");
  assert.equal((await request("/api/auth/session")).data.user?.role, "");
  assert.equal((await sendAdmin("/api/admin/users", "PATCH", { id: String(createdId), status: "active" })).status, 200);
  jar.clear();
  for (let index = 0; index < 5; index += 1) {
    const failed = await login(`${password}-wrong`);
    assert.ok(failed.data.url?.includes("error="), "Wrong password must fail.");
  }
  const locked = await users.findOne({ _id: createdId });
  assert.ok(locked.lockedUntil > new Date(), "Five failures must lock the account.");
  assert.ok((await login(password)).data.url?.includes("error="), "Locked account must reject the correct password.");
  const audit = await request("/api/admin/audit", {}, adminJar);
  assert.equal(audit.status, 200);
  assert.ok(audit.data.events.some((event) => event.target === String(createdId) && event.action === "account.update"), "Account mutation must have a durable audit event.");
  console.log("PASS: real staff login, session revocation, five-attempt lockout and transactional audit events.");
} finally {
  if (mongoose.connection.db) {
    // The random identifier and role prevent cleanup from touching pre-existing accounts.
    await mongoose.connection.db.collection("users").deleteOne({ studentId: staffId, role: "staff" });
  }
  await mongoose.disconnect();
  console.log("Temporary smoke-test account cleaned up; no existing account credentials were changed.");
}
