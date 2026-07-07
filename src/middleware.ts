import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  // If no password is configured, fail closed (except for the login page itself).
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (password && cookie === (await passwordToken(password))) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except: login page, login API, Next internals, favicon
    "/((?!login|api/login|_next/static|_next/image|favicon.ico).*)",
  ],
};
