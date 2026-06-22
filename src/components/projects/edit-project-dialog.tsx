"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/common/address-autocomplete";
import type { GeocodedAddress } from "@/lib/services/mapbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateProject } from "@/app/(dashboard)/projects/actions";
import { useRouter } from "next/navigation";

interface EditProjectDialogProps {
  projectId: string;
  name: string;
  address: string | null;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export function EditProjectDialog({
  projectId,
  name,
  address,
  status,
}: EditProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A newly-picked geocoded address (null = address unchanged).
  const geocodedRef = useRef<GeocodedAddress | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    const data: Parameters<typeof updateProject>[1] = {
      name: formData.get("name") as string,
      status: formData.get("status") as string,
    };
    // Only send the address + coords when the user picked a new one from the
    // autocomplete — that's what lets updateProject derive site intel.
    const geo = geocodedRef.current;
    if (geo) {
      data.address = geo.formatted_address;
      data.lat = geo.latitude;
      data.lng = geo.longitude;
      data.suburb = geo.suburb ?? null;
      data.state = geo.state ?? null;
      data.postcode = geo.postcode ?? null;
    }

    startTransition(async () => {
      const result = await updateProject(projectId, data);
      if (result.error) {
        setError(result.error);
      } else {
        geocodedRef.current = null;
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update the project name, address, or status.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Project Name *</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <AddressAutocomplete
              defaultValue={address ?? ""}
              placeholder="Start typing an Australian address…"
              onSelect={(geo) => {
                geocodedRef.current = geo;
              }}
            />
            <p className="text-xs text-muted-foreground">
              Pick an address from the list to auto-derive site intelligence
              (climate zone, wind region, BAL, council). Leave it as-is to keep
              the current address.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select name="status" defaultValue={status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
