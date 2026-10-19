import { createRequire } from "node:module";
import dns from "node:dns";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failures.push(message);
};
const httpsUrl = (value) => {
  if (!value) return false;
  const url = new URL(value);
  return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
};

try {
  check(httpsUrl(process.env.NEXTAUTH_URL), "NEXTAUTH_URL points to the public HTTPS deployment");
  check((process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").length >= 32, "Authentication secret has at least 32 characters (entropy/rotation must be verified separately)");
  check((process.env.STUDENT_APP_API_KEY || "").length >= 32, "Student integration key has at least 32 characters");
  check((process.env.INITIAL_ADMIN_SETUP_TOKEN || "").length >= 32, "Bootstrap token has at least 32 characters");
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error("MongoDB URI is required.");
  let connected = false;
  for (const resolver of [["8.8.8.8", "8.8.4.4"], ["1.1.1.1", "1.0.0.1"]]) {
    dns.setServers(resolver);
    try {
      await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
      connected = true;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("querySrv") || !error.message.includes("ECONNREFUSED")) throw error;
    }
  }
  if (!connected) throw new Error("MongoDB DNS lookup failed.");
  const database = mongoose.connection.db;
  const topology = await database.admin().command({ hello: 1 });
  check(Boolean(topology.setName || topology.msg === "isdbgrid") && topology.logicalSessionTimeoutMinutes != null, "Database supports sessions and transactions");
  const users = database.collection("users");
  check((await users.indexes()).some((index) => index.unique && index.key.email === 1), "Unique user-email index is installed");
  check(await users.countDocuments({ role: "admin", status: "active" }) >= 2, "At least two active administrator accounts exist");
  check(await users.countDocuments({ role: { $in: ["admin", "staff"] }, password: { $not: /^\$2[aby]\$/ } }) === 0, "All staff passwords use bcrypt");
  const mockCourses = await database.collection("courses").find({ code: /^MOCK-/ }, { projection: { _id: 1 } }).toArray();
  check(await users.countDocuments({ name: /^Mock /, status: "active" }) === 0, "No active mock student accounts");
  check(await database.collection("courses").countDocuments({ code: /^MOCK-/, active: true }) === 0, "No active mock courses");
  check(await database.collection("departments").countDocuments({ code: /^MOCK-/, active: true }) === 0, "No active mock departments");
  check(await database.collection("rooms").countDocuments({ code: /^MOCK-/, isAvailable: true }) === 0, "No available mock rooms");
  check(await database.collection("timetableallocations").countDocuments({ course: { $in: mockCourses.map((course) => course._id) }, status: "published" }) === 0, "No published mock schedules");
  const realCourses = database.collection("courses");
  check(await realCourses.countDocuments({ active: true, code: { $not: /^MOCK-/ }, catalogueOnly: { $ne: true } }) > 0, "At least one non-synthetic course is configured (curriculum approval must be verified separately)");
  check(await realCourses.countDocuments({
    active: true, catalogueOnly: true,
  }) === 0, "Catalogue-only entries are never active scheduling offerings");
} catch (error) {
  // Do not print connection strings or driver diagnostics containing account information.
  console.error("Production checks could not complete. Verify environment URLs, database access and indexes.");
  if (process.env.NODE_ENV !== "production" && error instanceof TypeError) console.error("A configured URL is invalid.");
  failures.push("Configuration or database check failed");
} finally {
  await mongoose.disconnect();
}
console.log(failures.length ? `${failures.length} production gate(s) failed. No data was changed.` : "Automated gates passed. Complete the operational sign-off in README before launch.");
process.exitCode = failures.length ? 1 : 0;
