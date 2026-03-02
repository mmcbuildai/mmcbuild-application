"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface MembersTableProps {
  members: Member[];
  currentProfileId: string;
  currentRole: string;
  invitations?: Invitation[];
}

export function MembersTable({
  members,
  currentProfileId,
  currentRole,
  invitations = [],
}: MembersTableProps) {
  const canManage = canManageMembers(currentRole);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team Members</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{members.length} member{members.length !== 1 ? "s" : ""}</Badge>
              {canManage && <InviteDialog currentRole={currentRole} />}
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
                <TableHead>Joined</TableHead>
                {canManage && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
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

function InviteDialog({ currentRole }: { currentRole: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await inviteUser(email, role);
      if (result.error) {
        setError(result.error);
      } else {
        setEmail("");
        setRole("viewer");
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join your organisation.
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
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !email.trim()}>
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

  function handleRoleChange(newRole: string) {
    startTransition(async () => {
      await updateMemberRole(member.id, newRole);
      router.refresh();
    });
  }

  function handleRemove() {
    if (!confirm(`Remove ${member.full_name} from the organisation?`)) return;
    startTransition(async () => {
      await removeMember(member.id);
      router.refresh();
    });
  }

  return (
    <TableRow>
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
