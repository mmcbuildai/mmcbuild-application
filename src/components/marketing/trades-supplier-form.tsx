"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  { value: "builder", label: "Builder" },
  { value: "architect", label: "Architect" },
  { value: "trade", label: "Trade" },
  { value: "building-certifier", label: "Building Certifier" },
  { value: "engineer", label: "Engineer" },
  { value: "project-manager", label: "Project Manager" },
  { value: "owner-builder", label: "Owner Builder" },
  { value: "town-planner", label: "Town Planner" },
  { value: "building-designer", label: "Building Designer" },
  { value: "quantity-surveyor", label: "Quantity Surveyor" },
];

const PHONE_PREFIXES = [
  { value: "+61", label: "🇦🇺 +61" },
  { value: "+1", label: "🇺🇸 +1" },
  { value: "+44", label: "🇬🇧 +44" },
  { value: "+64", label: "🇳🇿 +64" },
  { value: "+65", label: "🇸🇬 +65" },
  { value: "+91", label: "🇮🇳 +91" },
  { value: "+86", label: "🇨🇳 +86" },
  { value: "+81", label: "🇯🇵 +81" },
];

const initialForm = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phoneCountry: "+61",
  phone: "",
  role: "",
};

export default function TradesSupplierForm() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<Status>("idle");

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    const payload: LeadInput = {
      formType: "trades-supplier",
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phoneCountry: form.phoneCountry,
      phone: form.phone,
      company: form.company,
      role: form.role,
      interest: "",
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
      setForm(initialForm);
    } catch (err) {
      console.error("Trades & Suppliers form submission failed", err);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Thank you for your interest!</h3>
        <p className="text-slate-600 mb-6">
          We&apos;ll get back to you within 1 business day.
        </p>
        <Button onClick={() => setStatus("idle")} variant="outline">
          Submit Another Application
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-slate-700 text-lg mb-8 text-center">
        We&apos;d love to hear from you! Please fill out the form and we&apos;ll get back to you as
        soon as possible.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              First Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              required
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              placeholder="John"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Last Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              required
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              placeholder="Smith"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Email <span className="text-red-500">*</span>
          </label>
          <Input
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="john@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
          <div className="flex gap-2">
            <Select value={form.phoneCountry} onValueChange={(v) => update("phoneCountry", v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHONE_PREFIXES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Company <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            required
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Your Company"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
          <Select value={form.role} onValueChange={(v) => update("role", v)}>
            <SelectTrigger className="w-full">
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

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            There was an error submitting your form. Please try again.
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={status === "submitting"}
            className="bg-orange-500 hover:bg-orange-600 text-white px-12 py-6 text-base rounded-lg"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
