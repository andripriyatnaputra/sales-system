import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔴 JANGAN SENTUH API & STATIC ASSET
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // 🟢 HALAMAN LOGIN SELALU BOLEH DIAKSES
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  /**
   * 🔵 TIDAK ADA AUTH LOGIC DI MIDDLEWARE
   * Auth ditangani oleh:
   * - Backend (401)
   * - AuthGuard di client
   */
  return NextResponse.next();
}

/**
 * 🔥 Middleware HANYA UNTUK PAGE
 * API & STATIC EXCLUDED TOTAL
 */
export const config = {
  matcher: [
    "/((?!api|_next|favicon.ico|icons|images|assets|public).*)",
  ],
};
