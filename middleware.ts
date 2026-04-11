import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isLoggedIn = !!session;
  const role = (session?.user as any)?.role;
  const passwordChangeRequired = (session as any)?.passwordChangeRequired;

  const isAdminRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/kyc") ||
    nextUrl.pathname.startsWith("/blockchain") ||
    nextUrl.pathname.startsWith("/banks") ||
    nextUrl.pathname.startsWith("/certificates") ||
    nextUrl.pathname.startsWith("/audit") ||
    nextUrl.pathname.startsWith("/security") ||
    nextUrl.pathname.startsWith("/keys") ||
    nextUrl.pathname.startsWith("/alerts") ||
    nextUrl.pathname.startsWith("/settings") ||
    nextUrl.pathname.startsWith("/users");

  const isCustomerRoute = nextUrl.pathname.startsWith("/customer");

  // Force password change
  if (
    isLoggedIn &&
    passwordChangeRequired &&
    !nextUrl.pathname.startsWith("/change-password") &&
    !nextUrl.pathname.startsWith("/login")
  ) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Admin routes protection
  if (isAdminRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login/admin", req.url));
    }
    if (role === "customer") {
      return NextResponse.redirect(new URL("/login/admin", req.url));
    }
  }

  // Customer routes protection
  if (isCustomerRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login/customer", req.url));
    }
    if (role !== "customer") {
      return NextResponse.redirect(new URL("/login/customer", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
