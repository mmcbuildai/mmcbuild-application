"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateAutoTrackingConfig,
  generateWebhookSecret,
} from "@/app/(dashboard)/settings/rd-tracking/actions";

interface AutoTrackingConfigProps {
  config: {
    enabled: boolean;
    github_repo: string | null;
    webhook_secret: string | null;
    default_hours_per_commit: number;
    auto_approve_threshold: number;
  } | null;
  webhookUrl: string;
}

export function AutoTrackingConfig({
  config,
  webhookUrl,
}: AutoTrackingConfigProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [repo, setRepo] = useState(config?.github_repo ?? "");
  const [hoursPerCommit, setHoursPerCommit] = useState(
    config?.default_hours_per_commit ?? 0.5
  );
  const [threshold, setThreshold] = useState(
    config?.auto_approve_threshold ?? 0.85
  );
  const [secretVisible, setSecretVisible] = useState(false);
  const [secret, setSecret] = useState(config?.webhook_secret ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await updateAutoTrackingConfig({
        enabled,
        github_repo: repo || null,
        default_hours_per_commit: hoursPerCommit,
        auto_approve_threshold: threshold,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSecret() {
    const newSecret = await generateWebhookSecret();
    setSecret(newSecret);
    setSecretVisible(true);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label htmlFor="enabled" className="flex-1">
            Enable Auto-Tracking
          </Label>
          <button
            id="enabled"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="repo">GitHub Repository</Label>
          <Input
            id="repo"
            placeholder="owner/repo (e.g. dennissolver/mmcbuild)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="bg-muted" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(webhookUrl, "url")}
            >
              {copied === "url" ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Webhook Secret</Label>
          <div className="flex gap-2">
            <Input
              value={secretVisible ? secret : secret ? "••••••••" : "Not set"}
              readOnly
              className="bg-muted font-mono text-sm"
            />
            {secret && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSecretVisible(!secretVisible)}
              >
                {secretVisible ? "Hide" : "Show"}
              </Button>
            )}
            {secret && secretVisible && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(secret, "secret")}
              >
                {copied === "secret" ? "Copied" : "Copy"}
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerateSecret}>
            Generate New Secret
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hours">
            Default Hours per Commit: {hoursPerCommit}
          </Label>
          <input
            id="hours"
            type="range"
            min="0.25"
            max="2.0"
            step="0.25"
            value={hoursPerCommit}
            onChange={(e) => setHoursPerCommit(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.25h</span>
            <span>2.0h</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="threshold">
            Auto-Approve Threshold: {(threshold * 100).toFixed(0)}%
          </Label>
          <input
            id="threshold"
            type="range"
            min="0.5"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </CardContent>
    </Card>
  );
}
