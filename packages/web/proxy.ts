import { NextResponse, type NextRequest } from "next/server";

/**
 * Malformed case ids get a real 404 status before any page renders. (The pages also call notFound(), but they stream
 * a loading screen first, after which only the 404 page, not the status code, can still be sent.)
 */
const UID = /^0x[0-9a-fA-F]{64}$/;
const PREVIEW = /^preview(:|%3A)[\w.-]{1,80}$/i;

export function proxy(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const bad =
    (parts[0] === "cases" && parts.length === 2 && !UID.test(parts[1]!) && !PREVIEW.test(parts[1]!)) ||
    (parts[0] === "case" && parts.length === 3 && (!UID.test(parts[1]!) || !UID.test(parts[2]!)));
  if (bad) return NextResponse.rewrite(new URL("/404-not-found", req.url), { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: ["/cases/:id", "/case/:escrow/:fulfillment"] };
