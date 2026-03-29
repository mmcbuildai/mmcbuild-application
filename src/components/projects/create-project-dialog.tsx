"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createProject } from "@/app/(dashboard)/projects/actions";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { AddressAutocomplete } from "@/components/common/address-autocomplete";
import { usePropertyOnboarding, PropertyAssessment } from "@/lib/property-services";
import type { GeocodedAddress } from "@/lib/mapbox-types";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const geocodedRef = useRef<GeocodedAddress | null>(null);
  const router = useRouter();

  const property = usePropertyOnboarding({
    supabaseUrl: process.env.NEXT_PUBLIC_PROPERTY_SERVICES_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_PROPERTY_SERVICES_ANON_KEY!,
    product: "mmcbuild",
  });

  async function handleAddressSelect(address: GeocodedAddress) {
    geocodedRef.current = address;

    property.reset();
    await property.derive({
      address: address.formatted_address,
      lat: address.latitude,
      lng: address.longitude,
      suburb: address.suburb ?? undefined,
      state: address.state ?? undefined,
      postcode: address.postcode ?? undefined,
    });
  }

  async function handleSubmit(formData: FormData) {
    const geo = geocodedRef.current;
    if (geo) {
      formData.set("address", geo.formatted_address);
      formData.set("latitude", String(geo.latitude));
      formData.set("longitude", String(geo.longitude));
      formData.set("suburb", geo.suburb ?? "");
      formData.set("postcode", geo.postcode ?? "");
      formData.set("state", geo.state ?? "");
    }

    setLoading(true);
    try {
      const { projectId } = await createProject(formData);
      setOpen(false);
      geocodedRef.current = null;
      property.reset();
      router.push(`/projects/${projectId}?tab=documents`);
    } finally {
      setLoading(false);
    }
  }

  const profile = property.profile;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-4 shrink-0">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. 42 Smith Street Renovation"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <AddressAutocomplete
                onSelect={handleAddressSelect}
                placeholder="Start typing an Australian address..."
              />
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1 mt-4">
            {/* Property Analysis Section */}
            {property.loading && (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing property...
              </div>
            )}

            {property.error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {property.error}
              </div>
            )}

            {profile && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Property Analysis
                </p>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {profile.lot?.lotSize && (
                    <div>
                      <span className="text-muted-foreground">Lot Size</span>
                      <p className="font-medium">
                        {profile.lot.lotSize.toLocaleString()} m&sup2;
                      </p>
                    </div>
                  )}
                  {profile.zoning && (
                    <div>
                      <span className="text-muted-foreground">Zoning</span>
                      <p className="font-medium">{profile.zoning.name}</p>
                    </div>
                  )}
                  {profile.environment.windRegion && (
                    <div>
                      <span className="text-muted-foreground">Wind Region</span>
                      <p className="font-medium">
                        {profile.environment.windRegion}
                      </p>
                    </div>
                  )}
                  {profile.environment.climateZone && (
                    <div>
                      <span className="text-muted-foreground">Climate Zone</span>
                      <p className="font-medium">
                        {profile.environment.climateZone}
                      </p>
                    </div>
                  )}
                  {profile.environment.bal && (
                    <div>
                      <span className="text-muted-foreground">BAL Rating</span>
                      <p className="font-medium">{profile.environment.bal}</p>
                    </div>
                  )}
                  {profile.metadata.lgaName && (
                    <div>
                      <span className="text-muted-foreground">Council</span>
                      <p className="font-medium">{profile.metadata.lgaName}</p>
                    </div>
                  )}
                </div>

                {/* Subdivision */}
                {profile.subdivision && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Subdivision Potential
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.subdivision.torrens.feasible && (
                          <Badge variant="secondary">
                            Torrens (up to{" "}
                            {profile.subdivision.torrens.maxLots ?? "?"} lots)
                          </Badge>
                        )}
                        {profile.subdivision.strata.feasible && (
                          <Badge variant="secondary">Strata</Badge>
                        )}
                        {!profile.subdivision.torrens.feasible &&
                          !profile.subdivision.strata.feasible && (
                            <Badge variant="outline">Not feasible</Badge>
                          )}
                      </div>
                      {profile.subdivision.recommendations.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                          {profile.subdivision.recommendations.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {/* Overlays */}
                {profile.overlays.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Planning Overlays
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.overlays.map((o, i) => (
                          <Badge key={i} variant="outline">
                            {o.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Use case assessment */}
                <Separator />
                <PropertyAssessment
                  profile={profile}
                  onAssess={property.assess}
                  assessing={property.stage === "assessing"}
                  assessment={property.assessment}
                  product="mmcbuild"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t mt-4 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
