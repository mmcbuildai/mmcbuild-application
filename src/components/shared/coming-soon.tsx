import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, type LucideIcon } from "lucide-react";

export type ComingSoonProps = {
  moduleName: string;
  description: string;
  Icon?: LucideIcon;
  waitlistHref?: string;
};

export function ComingSoon({
  moduleName,
  description,
  Icon = Sparkles,
  waitlistHref = "/contact?interest=",
}: ComingSoonProps) {
  const href = waitlistHref.endsWith("=")
    ? `${waitlistHref}${encodeURIComponent(moduleName)}`
    : waitlistHref;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {moduleName} — coming soon
        </h2>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          {description}
        </p>
        <p className="mt-4 max-w-xl text-xs text-muted-foreground">
          Join the early access waitlist and we&apos;ll let you know the moment it&apos;s ready.
        </p>
        <Link href={href} className="mt-6">
          <Button className="bg-brand-600 hover:bg-brand-700">
            Join the waitlist
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
