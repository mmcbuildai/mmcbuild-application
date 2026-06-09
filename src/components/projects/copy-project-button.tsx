"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, Loader2 } from "lucide-react";
import { copyProject } from "@/app/(dashboard)/projects/actions";

interface CopyProjectButtonProps {
  projectId: string;
  variant?: "icon" | "menu";
  /** Stop click events from bubbling (used inside Link cards). */
  stopPropagation?: boolean;
}

export function CopyProjectButton({
  projectId,
  variant = "icon",
  stopPropagation = false,
}: CopyProjectButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The trigger lives on every project card. A bare click used to clone the
  // project instantly with a "(copy)" name — testers produced rows of
  // accidental "(copy 2)/(copy 3)" duplicates. Gate it behind a confirm that
  // states the consequence (PRODUCT_STANDARDS §9 consequence clarity).
  function stop(e: React.MouseEvent) {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function runCopy() {
    startTransition(async () => {
      setError(null);
      const result = await copyProject(projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.projectId) {
        router.push(`/projects/${result.projectId}`);
      }
    });
  }

  const trigger =
    variant === "menu" ? (
      <Button variant="outline" size="sm" onClick={stop} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Copy className="mr-1 h-4 w-4" />
        )}
        Copy
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-primary"
        onClick={stop}
        disabled={pending}
        title="Copy project"
        aria-label="Copy project"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    );

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a full duplicate — a new project with its own copy of
              the site intelligence, questionnaire answers and team. It will be
              named &ldquo;… (copy)&rdquo;. You can delete it afterwards if you
              didn&apos;t mean to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runCopy}>
              Copy project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <span className="ml-2 text-xs text-destructive">{error}</span>
      )}
    </>
  );
}
