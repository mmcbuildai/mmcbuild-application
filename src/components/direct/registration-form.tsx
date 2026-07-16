"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TRADE_TYPE_LABELS, AUSTRALIAN_STATES, STATE_LABELS, MMC_SPECIALISATIONS } from "@/lib/direct/constants";
import { ImageUpload } from "./image-upload";
import { registerProfessional } from "@/app/(dashboard)/direct/actions";
import type { AustralianState } from "@/lib/direct/types";

interface RegistrationFormProps {
  orgId: string;
}

export function RegistrationForm({ orgId }: RegistrationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [tradeType, setTradeType] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [specialisations, setSpecialisations] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");

  const toggleRegion = (state: string) => {
    setRegions((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const toggleSpec = (spec: string) => {
    setSpecialisations((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await registerProfessional({
      company_name: companyName,
      abn: abn || undefined,
      trade_type: tradeType,
      headline: headline || undefined,
      description: description || undefined,
      contact_name: contactName || undefined,
      phone,
      email,
      website: website || undefined,
      logo_url: logoUrl || undefined,
      regions,
      specialisations,
      years_experience: yearsExperience ? parseInt(yearsExperience) : undefined,
      licence_number: licenceNumber || undefined,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      router.push("/direct/dashboard");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abn">ABN</Label>
              <Input
                id="abn"
                value={abn}
                onChange={(e) => setAbn(e.target.value)}
                placeholder="00 000 000 000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tradeType">Trade Type *</Label>
            <select
              id="tradeType"
              value={tradeType}
              onChange={(e) => setTradeType(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select trade type</option>
              {Object.entries(TRADE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Leading modular builder in Sydney"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell potential clients about your company..."
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label>Company Logo</Label>
            <ImageUpload orgId={orgId} onUploaded={setLogoUrl} label="Upload Logo" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name</Label>
            <Input
              id="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Jane Smith"
              maxLength={120}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email *</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              type="url"
              placeholder="https://"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service Regions *</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MMC Specialisations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MMC_SPECIALISATIONS.map((spec) => (
              <button
                key={spec}
                type="button"
                onClick={() => toggleSpec(spec)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  specialisations.includes(spec)
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {spec}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="yearsExperience">Years of Experience</Label>
              <Input
                id="yearsExperience"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                type="number"
                min={0}
                max={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenceNumber">Licence Number</Label>
              <Input
                id="licenceNumber"
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700" size="lg">
        {loading ? "Registering..." : "Register Your Business"}
      </Button>
    </form>
  );
}
