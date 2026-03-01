import { Settings } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Organisation settings, team management, and RBAC
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <Settings className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Organisation Settings</CardTitle>
          <CardDescription>
            Manage your team, roles, and organisation details.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
