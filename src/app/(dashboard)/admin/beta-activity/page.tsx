import { redirect } from "next/navigation";

// The per-org Beta Activity page was retired in favour of the single all-orgs
// view (having two "Beta Activity" entries was confusing). Keep this route as a
// permanent redirect so existing links/bookmarks land on the canonical page.
export default function BetaActivityRedirect() {
  redirect("/admin/beta-activity-global");
}
