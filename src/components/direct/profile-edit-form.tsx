"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TRADE_TYPE_LABELS, AUSTRALIAN_STATES, STATE_LABELS, MMC_SPECIALISATIONS } from "@/lib/direct/constants";
import { ImageUpload } from "./image-upload";
import { updateProfessionalProfile, updateSpecialisations, deregisterProfessional } from "@/app/(dashboard)/direct/actions";
import type { Professional, Specialisation, AustralianState } from "@/lib/direct/types";

interface ProfileEditFormProps {
  professional: Professional & { specialisations?: Specialisation[] };
  orgId: string;
}

export function ProfileEditForm({ professional: pro, orgId }: ProfileEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deregisterOpen, setDeregisterOpen] = useState(false);
  const [deregistering, setDeregistering] = useState(false);

  const [companyName, setCompanyName] = useState(pro.company_name);
  const [abn, setAbn] = useState(pro.abn || "");
  const [tradeType, setTradeType] = useState(pro.trade_type);
  const [headline, setHeadline] = useState(pro.headline || "");
  const [description, setDescription] = useState(pro.description || "");
  const [phone, setPhone] = useState(pro.phone || "");
  const [email, setEmail] = useState(pro.email || "");
  const [website, setWebsite] = useState(pro.website || "");
  const [logoUrl, setLogoUrl] = useState(pro.logo_url || "");
  const [coverUrl, setCoverUrl] = useState(pro.cover_image_url || "");
  const [regions, setRegions] = useState<string[]>(pro.regions || []);
  const [specs, setSpecs] = useState<string[]>(
    pro.specialisations?.map((s) => s.label) || []
  );
  const [yearsExperience, setYearsExperience] = useState(
    pro.years_experience?.toString() || ""
  );
  const [licenceNumber, setLicenceNumber] = useState(pro.licence_number || "");

  const toggleRegion = (state: string) => {
    setRegions((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const toggleSpec = (spec: string) => {
    setSpecs((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const [profileResult, specResult] = await Promise.all([
      updateProfessionalProfile(pro.id, {
        company_name: companyName,
        abn: abn || undefined,
        trade_type: tradeType,
        headline: headline || undefined,
        description: description || undefined,
        phone,
        email,
        website: website || undefined,
        logo_url: logoUrl || undefined,
        cover_image_url: coverUrl || undefined,
        regions,
        years_experience: yearsExperience ? parseInt(yearsExperience) : undefined,
        licence_number: licenceNumber || undefined,
      }),
      updateSpecialisations(pro.id, specs),
    ]);

    setLoading(false);

    if (profileResult.error) {
      setError(profileResult.error);
    } else if (specResult.error) {
      setError(specResult.error);
    } else {
      setSuccess(true);
      router.refresh();
    }
  };

  const handleDeregister = async () => {
    setDeregistering(true);
    const result = await deregisterProfessional(pro.id);
    setDeregistering(false);
    if (result.error) {
      setError(result.error);
      setDeregisterOpen(false);
    } else {
      router.push("/direct");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>ABN</Label>
            <Input value={abn} onChange={(e) => setAbn(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Trade Type</Label>
          <select
            value={tradeType}
            onChange={(e) => setTradeType(e.target.value as typeof tradeType)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(TRADE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Headline</Label>
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Phone *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Website</Label>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} type="url" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Logo</Label>
            <ImageUpload orgId={orgId} onUploaded={setLogoUrl} label="Upload Logo" currentUrl={logoUrl} />
          </div>
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <ImageUpload orgId={orgId} onUploaded={setCoverUrl} label="Upload Cover" currentUrl={coverUrl} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Years of Experience</Label>
            <Input value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} type="number" min={0} max={100} />
          </div>
          <div className="space-y-2">
            <Label>Licence Number</Label>
            <Input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Service Regions</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AUSTRALIAN_STATES.map((state) => (
            <label
              key={state}
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                regions.includes(state)
                  ? "border-amber-500 bg-amber-50"
                  : "border-input hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                checked={regions.includes(state)}
                onChange={() => toggleRegion(state)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{state}</span>
              <span className="text-xs text-muted-foreground">{STATE_LABELS[state as AustralianState]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">MMC Specialisations</Label>
        <div className="flex flex-wrap gap-2">
          {MMC_SPECIALISATIONS.map((spec) => (
            <button
              key={spec}
              type="button"
              onClick={() => toggleSpec(spec)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                specs.includes(spec)
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {spec}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Profile updated successfully!</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700">
          {loading ? "Saving..." : "Save Changes"}
        </Button>

        {pro.status !== "deregistered" && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeregisterOpen(true)}
          >
            Deregister Business
          </Button>
        )}
      </div>

      <AlertDialog open={deregisterOpen} onOpenChange={setDeregisterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deregister Business</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deregister {pro.company_name}? 
              This will remove your listing from the public MMC Direct directory. 
              You can re-register later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeregister}
              disabled={deregistering}
              className="bg-red-600 hover:bg-red-700"
            >
              {deregistering ? "Deregistering..." : "Yes, deregister"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
