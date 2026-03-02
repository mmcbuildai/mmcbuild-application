"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Trash2 } from "lucide-react";
import {
  updateMemberRole,
  removeMember,
} from "@/app/(dashboard)/settings/organisation/actions";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

interface MembersTableProps {
  members: Member[];
  currentProfileId: string;
  currentRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  architect: "Architect",
  builder: "Builder",
  trade: "Trade",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  architect: "bg-green-100 text-green-800",
  builder: "bg-orange-100 text-orange-800",
  trade: "bg-yellow-100 text-yellow-800",
  viewer: "bg-gray-100 text-gray-800",
};

export function MembersTable({
  members,
  currentProfileId,
  currentRole,
}: MembersTableProps) {
  const canManage = currentRole === "owner" || currentRole === "admin";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Team Members</CardTitle>
          <Badge variant="secondary">{members.length} member{members.length !== 1 ? "s" : ""}</Badge>
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
            <SelectTrigger className="h-8 w-[130px]">
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
            className={`text-xs ${ROLE_COLORS[member.role] ?? ""}`}
          >
            {ROLE_LABELS[member.role] ?? member.role}
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
