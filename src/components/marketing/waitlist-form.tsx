"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadInput } from "@/lib/validators/lead";

type Status = "idle" | "submitting" | "success" | "error";

const ROLES = [
  { value: "architect", label: "Architect" },
  { value: "builder", label: "Builder" },
  { value: "developer", label: "Developer" },
  { value: "engineer", label: "Engineer" },
  { value: "contractor", label: "Contractor" },
  { value: "consultant", label: "Consultant" },
  { value: "other", label: "Other" },
];

const INTERESTS = [
  { value: "comply", label: "MMC Comply" },
  { value: "build", label: "MMC Build" },
  { value: "quote", label: "MMC Quote" },
  { value: "directory", label: "MMC Directory" },
  { value: "train", label: "MMC Train" },
  { value: "all", label: "All Products" },
];

const initialForm = {
  name: "",
  email: "",
  company: "",
  role: "",
  interest: "",
};

export default function WaitlistForm({ defaultInterest }: { defaultInterest?: string }) {
  const [form, setForm] = useState({ ...initialForm, interest: defaultInterest || "" });
  const [status, setStatus] = useState<Status>("idle");

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    const [firstName, ...rest] = form.name.trim().split(/\s+/);
    const lastName = rest.join(" ");

    const payload: LeadInput = {
      formType: "waitlist",
      firstName: firstName || form.name,
      lastName,
      email: form.email,
      phoneCountry: "",
      phone: "",
      company: form.company,
      role: form.role,
      interest: form.interest,
      message: "",
      sourcePage: typeof window !== "undefined" ? window.location.href : "",
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Lead submit ${res.status}`);
      setStatus("success");
      setForm({ ...initialForm, interest: defaultInterest || "" });
    } catch (err) {
      console.error("Waitlist form submission failed", err);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re on the list!</h3>
        <p className="text-slate-600">
          Thanks for joining the MMC Build waitlist. We&apos;ll be in touch soon with exclusive
          updates and early access.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 space-y-5">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-slate-900">Join the Waitlist</h3>
        <p className="text-slate-500 text-sm mt-1">Get early access to MMC Build tools</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name" className="text-slate-700">
            Full Name
          </Label>
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="John Smith"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="email" className="text-slate-700">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="john@company.com"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="company" className="text-slate-700">
            Company
          </Label>
          <Input
            id="company"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Your company name"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="role" className="text-slate-700">
            Your Role
          </Label>
          <Select value={form.role} onValueChange={(v) => update("role", v)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="interest" className="text-slate-700">
            Primary Interest
          </Label>
          <Select value={form.interest} onValueChange={(v) => update("interest", v)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="What interests you most?" />
            </SelectTrigger>
            <SelectContent>
              {INTERESTS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {status === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          There was an error submitting your form. Please try again.
        </div>
      )}

      <Button
        type="submit"
        disabled={status === "submitting"}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-full text-base font-medium"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining...
          </>
        ) : (
          "Join Waitlist"
        )}
      </Button>

      <p className="text-xs text-slate-500 text-center">
        By joining, you agree to our Privacy Policy and Terms of Service.
      </p>
    </form>
  );
}
