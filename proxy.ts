import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import { isActiveStaff } from "@/lib/accountPolicy";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET });
  const pathname = request.nextUrl.pathname;
  const publicRoute = pathname === "/setup" || pathname === "/api/admin/bootstrap" || pathname === "/api/health" || pathname.startsWith("/api/integration/");
  if (publicRoute) return NextResponse.next();
  let activeStaff = false;
  if (token?.sub && /^[a-f\d]{24}$/i.test(token.sub)) {
    try {
      await connectToDatabase();
      activeStaff = isActiveStaff(await User.findById(token.sub).select("role status").lean());
    } catch (error) {
      console.error("Session authorization unavailable:", error);
      return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
    }
  }

  if (pathname === "/login") {
    if (activeStaff) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (!activeStaff) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Active staff authentication required." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|images|offline.html).*)"],
};
