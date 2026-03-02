"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/app/(dashboard)/projects/actions";
import { useRouter } from "next/navigation";

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
}

export function DeleteProjectButton({
  projectId,
  projectName,
}: DeleteProjectButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete "${projectName}"? This will permanently remove all plans, compliance checks, findings, and associated data. This cannot be undone.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (result.error) {
        alert(result.error);
      } else {
        router.push("/projects");
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={isPending}
      onClick={handleDelete}
    >
      <Trash2 className="mr-2 h-3.5 w-3.5" />
      {isPending ? "Deleting..." : "Delete"}
    </Button>
  );
}
