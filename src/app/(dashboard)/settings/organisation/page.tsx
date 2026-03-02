import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrganisation, getMembers } from "./actions";
import { OrgDetailsForm } from "@/components/settings/org-details-form";
import { MembersTable } from "@/components/settings/members-table";

export default async function OrganisationSettingsPage() {
  const org = await getOrganisation();

  if (!org) {
    redirect("/settings");
  }

  const { members, currentProfileId, currentRole } = await getMembers();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Organisation Settings</h1>
        <p className="text-muted-foreground">
          Manage your organisation details and team members
        </p>
      </div>

      <OrgDetailsForm
        orgName={org.name}
        orgAbn={org.abn}
        canEdit={currentRole === "owner" || currentRole === "admin"}
      />

      <MembersTable
        members={members}
        currentProfileId={currentProfileId}
        currentRole={currentRole}
      />
    </div>
  );
}
