import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/creator/profile-setup") {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/creator/profile/setup";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/creator/profile-setup"],
};