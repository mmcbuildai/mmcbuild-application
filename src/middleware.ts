import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/projects",
  "/comply",
  "/build",
  "/quote",
  "/direct",
  "/train",
  "/billing",
  "/settings",
  "/beta",
];

const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === "production",
            })
          );
        },
      },
    }
  );

  // Resolve the session. The auth check must NEVER hard-500 the request:
  // middleware runs on every route (including /login itself), so a throw here
  // — notably from the Edge runtime on the logged-out path — would take down
  // the login page and lock everyone out. On failure, degrade to
  // "unauthenticated and continue": protected routes below still redirect to
  // /login (fail-closed) and data access is guarded again at the page /
  // server-action layer, so no protected content is exposed.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] =
    null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error(
      "middleware: auth.getUser() threw; treating request as unauthenticated",
      err,
    );
  }

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from protected routes
  if (!user && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && AUTH_ROUTES.some((route) => pathname === route)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    // Don't carry login/signup-only query params onto /dashboard.
    // Notably ?error= from a stale failed callback would otherwise show
    // up on the dashboard even though the user is authenticated.
    url.searchParams.delete("error");
    url.searchParams.delete("message");
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
