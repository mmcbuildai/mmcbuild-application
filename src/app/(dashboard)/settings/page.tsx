import { Settings, BookOpen, Clock, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

const settingsCards = [
  {
    title: "Organisation Settings",
    description: "Manage your team, roles, and organisation details.",
    icon: Settings,
    href: "#",
    disabled: true,
  },
  {
    title: "Knowledge Bases",
    description:
      "Manage reference documents (NCC volumes, standards) for AI compliance analysis.",
    icon: BookOpen,
    href: "/settings/knowledge",
    disabled: false,
  },
  {
    title: "R&D Time Tracking",
    description:
      "Log R&D hours by stage and deliverable for tax incentive claims.",
    icon: Clock,
    href: "/settings/rd-tracking",
    disabled: false,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Organisation settings, knowledge management, and R&D tracking
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsCards.map((card) => {
          const content = (
            <Card
              key={card.title}
              className={`transition-shadow ${
                card.disabled
                  ? "opacity-60"
                  : "hover:shadow-md cursor-pointer"
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <card.icon className="h-8 w-8 text-muted-foreground" />
                  {!card.disabled && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <CardTitle className="text-lg">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              {card.disabled && (
                <CardContent>
                  <p className="text-xs text-muted-foreground">Coming soon</p>
                </CardContent>
              )}
            </Card>
          );

          if (card.disabled) return <div key={card.title}>{content}</div>;

          return (
            <Link key={card.title} href={card.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
