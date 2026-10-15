import mongoose from "mongoose";
import dns from "node:dns";

const atlasDnsResolvers = [
  ["8.8.8.8", "8.8.4.4"],
  ["1.1.1.1", "1.0.0.1"],
];

const MONGODB_URI = (
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  process.env.DATABASE_URL ||
  ""
)
  .trim()
  .replace(/^['"]|['"]$/g, "");

export function getMongoConnectionDiagnostics() {
  return {
    uri: MONGODB_URI ? MONGODB_URI.replace(/:([^@]+)@/, ":***@") : "MONGODB_URI is not set",
    isAtlasUri: /mongodb\+srv:\/\//i.test(MONGODB_URI),
    usesLocalhost: /localhost|127\.0\.0\.1/i.test(MONGODB_URI),
    envSource: process.env.MONGODB_URI
      ? "MONGODB_URI"
      : process.env.MONGODB_URL
        ? "MONGODB_URL"
        : process.env.DATABASE_URL
          ? "DATABASE_URL"
          : "not configured",
  };
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached = globalThis.mongooseCache ?? { conn: null, promise: null };
if (!globalThis.mongooseCache) {
  globalThis.mongooseCache = cached;
}

function isSrvDnsFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("querySrv") && message.includes("ECONNREFUSED");
}

async function connectToAtlas() {
  let lastDnsError: unknown;

  for (const resolvers of atlasDnsResolvers) {
    dns.setServers(resolvers);
    try {
      return await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        autoIndex: true,
      });
    } catch (error) {
      if (!isSrvDnsFailure(error)) {
        throw error;
      }
      lastDnsError = error;
      console.warn(`MongoDB SRV DNS lookup failed with ${resolvers.join(", ")}; trying the next resolver.`);
    }
  }

  throw lastDnsError;
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Configure a production MongoDB Atlas connection string before starting the app.");
  }

  if (/localhost|127\.0\.0\.1/i.test(MONGODB_URI)) {
    throw new Error("MONGODB_URI must target your managed MongoDB Atlas or cloud deployment, not a local development instance.");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = connectToAtlas();
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    const message = error instanceof Error ? error.message : "Unknown MongoDB connection error";
    const diagnostics = getMongoConnectionDiagnostics();

    console.error("MongoDB connection failed:", {
      ...diagnostics,
      message,
    });

    throw new Error(
      "MongoDB connection failed. Check that your Atlas cluster is running, your current IP is whitelisted in Network Access, and MONGODB_URI is valid. Details: " +
        message
    );
  }
}
