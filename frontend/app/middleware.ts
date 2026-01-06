import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔥 API JANGAN PERNAH DISENTUH MIDDLEWARE
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // allow login page
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const token =
    req.cookies.get("token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // ❗❗❗ API DI-EXCLUDE SECARA TOTAL
    "/((?!_next|static|favicon.ico|api).*)",
  ],
};
