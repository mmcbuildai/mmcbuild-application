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

/**
 * Auth pages an already-signed-in user is bounced away from.
 *
 * /signup is deliberately NOT here. Bouncing a signed-in visitor off /login is
 * right — they asked to log in and they already are. Bouncing them off /signup
 * is not: they asked to create an ACCOUNT, and being silently redirected to
 * someone else's dashboard looks like the product refusing to let them.
 *
 * Karen hit exactly this — "trying to create a new account with a different
 * name email address but it is not allowing me. Do I need to clear my cache?"
 * Nothing was broken; she was signed in, so /signup 307'd to /dashboard and she
 * never saw the form. The cache instinct is the tell: an invisible redirect
 * feels like stale state.
 *
 * It gets worse the moment the public CTA switches to purchase (SCRUM-372),
 * because those buttons point at /signup — so any signed-in visitor clicking
 * "Get started" from the marketing site would land on a dashboard with no
 * explanation.
 *
 * /signup now renders, and tells them who they are signed in as with a way to
 * sign out (see the signed-in notice on the signup page).
 */
const AUTH_ROUTES = ["/login"];

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

  // app.mmcbuild.com.au serves ONLY the application — the marketing brochure is
  // a separate Vercel project on mmcbuild.com.au. The leftover (marketing)
  // landing at the root stranded beta testers on a "14 days free" waitlist form
  // with no visible way into the app or its Magic Link tab (Sharon, 2026-06-19).
  // Send the app root straight where the visitor needs to go.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/dashboard" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

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
