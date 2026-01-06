import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ❌ JANGAN sentuh API sama sekali
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  res.cookies.set("current-path", pathname);

  // allow login page
  if (pathname.startsWith("/login")) {
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

/**
 * 🔥 PALING PENTING
 * Middleware HANYA untuk PAGE
 * BUKAN API
 */
export const config = {
  matcher: [
    "/((?!_next|static|favicon.ico|api).*)",
  ],
};
