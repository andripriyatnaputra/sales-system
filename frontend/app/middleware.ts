import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();
  res.cookies.set("current-path", pathname);

  // ✅ ALLOW PUBLIC ROUTES
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/health")
  ) {
    return res;
  }

  // ❌ JANGAN proteksi semua /api
  if (pathname.startsWith("/api")) {
    return res;
  }

  const token =
    req.cookies.get("token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|static|favicon.ico).*)",
  ],
};
