"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus, RotateCw, X, Clock } from "lucide-react";
import {
  updateMemberRole,
  removeMember,
  inviteUser,
  revokeInvitation,
  resendInvitation,
} from "@/app/(dashboard)/settings/organisation/actions";
import { useRouter } from "next/navigation";
import {
  ROLE_LABELS,
  ROLE_COLORS,
  ASSIGNABLE_ROLES,
  canManageMembers,
} from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/types";

type SeatType = "internal" | "external" | "viewer";

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
  seat_type: SeatType;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  seat_type: SeatType;
  project_ids: string[] | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface SeatUsage {
  used: number;
  pendingInvites: number;
  limit: number;
  canAddInternal: boolean;
  tier: string;
}

interface ProjectForInvite {
  id: string;
  name: string;
  status: string;
}

interface MembersTableProps {
  members: Member[];
  currentProfileId: string;
  currentRole: string;
  invitations?: Invitation[];
  seatUsage?: SeatUsage;
  projectsForInvite?: ProjectForInvite[];
}

const SEAT_TYPE_LABEL: Record<SeatType, string> = {
  internal: "Internal",
  external: "External",
  viewer: "Viewer",
};

const SEAT_TYPE_HELPER: Record<SeatType, string> = {
  internal: "Full org access. Counts against your seat cap.",
  external:
    "Project-scoped uploader and editor. No seat consumed. Choose which projects they can access.",
  viewer:
    "Project-scoped read-only access. No seat consumed. Choose which projects they can view.",
};

export function MembersTable({
  members,
  currentProfileId,
  currentRole,
  invitations = [],
  seatUsage,
  projectsForInvite = [],
}: MembersTableProps) {
  const canManage = canManageMembers(currentRole);
  const internalMembers = members.filter((m) => m.seat_type === "internal");
  const projectScoped = members.filter((m) => m.seat_type !== "internal");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Team Members</CardTitle>
              {seatUsage && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Internal seats:{" "}
                  <span className="font-medium text-foreground">
                    {seatUsage.used}
                    {seatUsage.pendingInvites > 0 &&
                      ` (+${seatUsage.pendingInvites} pending)`}
                  </span>
                  {Number.isFinite(seatUsage.limit) ? (
                    <> of {seatUsage.limit}</>
                  ) : (
                    <> (unlimited)</>
                  )}{" "}
                  on the {seatUsage.tier} plan. External and viewer
                  collaborators don't consume seats.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </Badge>
              {canManage && (
                <InviteDialog
                  currentRole={currentRole}
                  seatUsage={seatUsage}
                  projectsForInvite={projectsForInvite}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Seat</TableHead>
                <TableHead>Joined</TableHead>
                {canManage && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {internalMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === currentProfileId}
                  canManage={canManage}
                />
              ))}
              {projectScoped.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === currentProfileId}
                  canManage={canManage}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pending Invitations</CardTitle>
              <Badge variant="outline">{invitations.length} pending</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invite) => (
                  <InvitationRow key={invite.id} invitation={invite} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InviteDialog({
  currentRole,
  seatUsage,
  projectsForInvite,
}: {
  currentRole: string;
  seatUsage?: SeatUsage;
  projectsForInvite: ProjectForInvite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [seatType, setSeatType] = useState<SeatType>("internal");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await inviteUser(email, role, {
        seatType,
        projectIds: seatType === "internal" ? [] : selectedProjectIds,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setEmail("");
        setRole("viewer");
        setSeatType("internal");
        setSelectedProjectIds([]);
        setOpen(false);
        router.refresh();
      }
    });
  }

  // Filter roles the current user can assign
  const availableRoles = ASSIGNABLE_ROLES.filter((r) => {
    const actorLevel = currentRole === "owner" ? 7 : currentRole === "admin" ? 6 : 0;
    const targetLevel: Record<string, number> = { owner: 7, admin: 6, project_manager: 5, architect: 4, builder: 3, trade: 2, viewer: 1 };
    return actorLevel > (targetLevel[r] ?? 0);
  });

  const internalCapReached =
    seatUsage !== undefined && !seatUsage.canAddInternal;
  const projectScoped = seatType === "external" || seatType === "viewer";

  function toggleProject(id: string) {
    setSelectedProjectIds((curr) =>
      curr.includes(id) ? curr.filter((p) => p !== id) : [...curr, id],
    );
  }

  const submitDisabled =
    isPending ||
    !email.trim() ||
    (seatType === "internal" && internalCapReached) ||
    (projectScoped && selectedProjectIds.length === 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send a magic-link invitation. Internal seats consume your seat cap;
            external collaborators and viewers don't.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-seat-type">Seat type</Label>
            <Select
              value={seatType}
              onValueChange={(v) => setSeatType(v as SeatType)}
            >
              <SelectTrigger id="invite-seat-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">
                  Internal team — full org access
                </SelectItem>
                <SelectItem value="external">
                  External collaborator — project-scoped uploader
                </SelectItem>
                <SelectItem value="viewer">
                  Viewer — project-scoped read-only
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SEAT_TYPE_HELPER[seatType]}
            </p>
            {seatType === "internal" && internalCapReached && (
              <p className="text-xs text-destructive">
                Seat limit reached ({seatUsage?.used ?? 0} +{" "}
                {seatUsage?.pendingInvites ?? 0} pending of {seatUsage?.limit}).
                Upgrade your plan or invite as external/viewer instead.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projectScoped && (
            <div className="space-y-2">
              <Label>Project access</Label>
              <p className="text-xs text-muted-foreground">
                Choose which projects this person can access. They will not see
                any other projects in your organisation.
              </p>
              {projectsForInvite.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No projects yet. Create one before inviting external
                  collaborators.
                </p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                  {projectsForInvite.map((p) => (
                    <label
                      key={p.id}
                      className="flex w-fit cursor-pointer select-none items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={selectedProjectIds.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                      />
                      <span className="text-sm">{p.name}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        ({p.status})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {isPending ? "Sending..." : "Send Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  isSelf,
  canManage,
}: {
  member: Member;
  isSelf: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

  function handleRoleChange(newRole: string) {
    startTransition(async () => {
      await updateMemberRole(member.id, newRole);
      router.refresh();
    });
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remove member?",
      description: `Remove ${member.full_name} from the organisation?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await removeMember(member.id);
      router.refresh();
    });
  }

  return (
    <TableRow>
      {dialog}
      <TableCell className="font-medium">
        {member.full_name}
        {isSelf && (
          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
        )}
      </TableCell>
      <TableCell>{member.email}</TableCell>
      <TableCell>
        {canManage && !isSelf ? (
          <Select
            defaultValue={member.role}
            onValueChange={handleRoleChange}
            disabled={isPending}
          >
            <SelectTrigger className="h-8 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge
            variant="secondary"
            className={`text-xs ${ROLE_COLORS[member.role as UserRole] ?? ""}`}
          >
            {ROLE_LABELS[member.role as UserRole] ?? member.role}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={member.seat_type === "internal" ? "default" : "outline"}
          className="text-xs"
        >
          {SEAT_TYPE_LABEL[member.seat_type]}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(member.created_at).toLocaleDateString("en-AU")}
      </TableCell>
      {canManage && (
        <TableCell>
          {!isSelf && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={isPending}
              onClick={handleRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isExpired = new Date(invitation.expires_at) < new Date();

  function handleRevoke() {
    startTransition(async () => {
      await revokeInvitation(invitation.id);
      router.refresh();
    });
  }

  function handleResend() {
    startTransition(async () => {
      await resendInvitation(invitation.id);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{invitation.email}</TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={`text-xs ${ROLE_COLORS[invitation.role as UserRole] ?? ""}`}
        >
          {ROLE_LABELS[invitation.role as UserRole] ?? invitation.role}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={invitation.seat_type === "internal" ? "default" : "outline"}
          className="text-xs"
          title={
            invitation.project_ids && invitation.project_ids.length > 0
              ? `${invitation.project_ids.length} project(s)`
              : undefined
          }
        >
          {SEAT_TYPE_LABEL[invitation.seat_type] ?? invitation.seat_type}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {isExpired ? (
            <span className="text-destructive">Expired</span>
          ) : (
            new Date(invitation.expires_at).toLocaleDateString("en-AU")
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isPending}
            onClick={handleResend}
            title="Resend invitation"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={handleRevoke}
            title="Revoke invitation"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
