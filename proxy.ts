import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET });
  const pathname = request.nextUrl.pathname;

  if (pathname === "/login") {
    if (token?.role === "staff" || token?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/setup" || pathname === "/api/admin/bootstrap" || pathname === "/api/integration/campus") {
    return NextResponse.next();
  }

  if (token?.role !== "staff" && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|images|offline.html).*)"],
};
