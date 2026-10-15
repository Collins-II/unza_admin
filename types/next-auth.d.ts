import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      studentId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    studentId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    studentId?: string;
  }
}
