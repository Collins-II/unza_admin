import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import User from "@/lib/database/models/User";
import { connectToDatabase } from "@/lib/database";
import { isActiveStaff } from "@/lib/accountPolicy";
import { failedLoginUpdate } from "@/lib/loginAttempts";

const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.rJq3yH0k2WZ6s2z0bEw1q5yQe4yO";

const nextAuthSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

if (process.env.NODE_ENV === "production" && !nextAuthSecret) {
  throw new Error("NEXTAUTH_SECRET is required in production. Set it in the deployment environment before starting the app.");
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        studentId: { label: "Staff ID or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.studentId || !credentials?.password || credentials.studentId.length > 160 || credentials.password.length > 200) {
          return null;
        }

        const login = credentials.studentId.trim();
        const normalizedStudentId = login.toUpperCase();

        try {
          await connectToDatabase();
          const user = await User.findOne({
            $or: [{ studentId: normalizedStudentId }, { email: login.toLowerCase() }],
            role: { $in: ["staff", "admin"] },
            status: "active",
          }).select("+password +failedLoginAttempts +lockedUntil");

          if (!user || !user.password?.startsWith("$2")) {
            await bcrypt.compare(credentials.password, DUMMY_HASH);
            return null;
          }
          if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return null;
          if (!(await bcrypt.compare(credentials.password, user.password))) {
            await User.updateOne({
              _id: user._id, password: user.password,
              $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: new Date() } }],
            }, failedLoginUpdate(), { updatePipeline: true });
            return null;
          }
          const confirmed = await User.updateOne({
            _id: user._id, password: user.password, status: "active", role: user.role,
            $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: new Date() } }],
          }, { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } });
          if (confirmed.matchedCount !== 1) return null;

          return {
            id: String(user._id),
            name: user.name,
            email: user.email,
            studentId: user.studentId,
            role: user.role,
          };
        } catch (error) {
          console.error("Database auth failed:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.studentId = (user as { studentId?: string }).studentId ?? token.sub ?? "";
      }
      if (token.sub) {
        await connectToDatabase();
        const current = await User.findById(token.sub).select("role status studentId").lean();
        token.role = current && isActiveStaff(current) ? current.role : "";
        token.studentId = current?.studentId || "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string | undefined) ?? "";
        session.user.studentId = (token.studentId as string | undefined) ?? "";
      }
      return session;
    },
  },
};
