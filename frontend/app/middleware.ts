import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // simpan path agar bisa dibaca layout server component
  const res = NextResponse.next();
  res.cookies.set("current-path", pathname);

  const token =
    req.cookies.get("token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (pathname.startsWith("/login")) {
    return res;
  }

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|static|favicon.ico).*)", // protect everything except static files
  ],
};
