"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveHoldingCostVariables } from "@/app/(dashboard)/quote/actions";

interface CustomItem {
  label: string;
  amount: number;
}

interface HoldingCostVariables {
  weekly_finance_cost: number;
  weekly_site_costs: number;
  weekly_insurance: number;
  weekly_opportunity_cost: number;
  weekly_council_fees: number;
  custom_items: CustomItem[];
}

interface HoldingCostCalculatorProps {
  estimateId: string;
  traditionalCost: number;
  mmcCost: number;
  traditionalWeeks: number | null;
  mmcWeeks: number | null;
  initialVariables: HoldingCostVariables | null;
}

const DEFAULT_VARS: HoldingCostVariables = {
  weekly_finance_cost: 0,
  weekly_site_costs: 0,
  weekly_insurance: 0,
  weekly_opportunity_cost: 0,
  weekly_council_fees: 0,
  custom_items: [],
};

export function HoldingCostCalculator({
  estimateId,
  traditionalCost,
  mmcCost,
  traditionalWeeks,
  mmcWeeks,
  initialVariables,
}: HoldingCostCalculatorProps) {
  const [vars, setVars] = useState<HoldingCostVariables>(
    initialVariables ?? DEFAULT_VARS
  );
  const [saving, setSaving] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tradWeeks = traditionalWeeks ?? 26;
  const mmcWks = mmcWeeks ?? 16;
  const weeksSaved = tradWeeks - mmcWks;
  const timeSavingPct = tradWeeks > 0 ? Math.round((weeksSaved / tradWeeks) * 100) : 0;

  // Weekly total from all holding cost items
  const weeklyTotal =
    vars.weekly_finance_cost +
    vars.weekly_site_costs +
    vars.weekly_insurance +
    vars.weekly_opportunity_cost +
    vars.weekly_council_fees +
    vars.custom_items.reduce((sum, item) => sum + item.amount, 0);

  const tradHolding = weeklyTotal * tradWeeks;
  const mmcHolding = weeklyTotal * mmcWks;

  const tradTrue = traditionalCost + tradHolding;
  const mmcTrue = mmcCost + mmcHolding;

  const constructionSavings = traditionalCost - mmcCost;
  const holdingSavings = tradHolding - mmcHolding;
  const trueSavings = constructionSavings + holdingSavings;

  // Debounced auto-save
  const debouncedSave = useCallback(
    (newVars: HoldingCostVariables) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        setSaving(true);
        await saveHoldingCostVariables(estimateId, newVars);
        setSaving(false);
      }, 800);
    },
    [estimateId]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  const updateVar = (key: keyof Omit<HoldingCostVariables, "custom_items">, value: number) => {
    const updated = { ...vars, [key]: value };
    setVars(updated);
    debouncedSave(updated);
  };

  const updateCustomItem = (index: number, field: "label" | "amount", value: string | number) => {
    const items = [...vars.custom_items];
    items[index] = { ...items[index], [field]: value };
    const updated = { ...vars, custom_items: items };
    setVars(updated);
    debouncedSave(updated);
  };

  const addCustomItem = () => {
    const updated = {
      ...vars,
      custom_items: [...vars.custom_items, { label: "", amount: 0 }],
    };
    setVars(updated);
    debouncedSave(updated);
  };

  const removeCustomItem = (index: number) => {
    const items = vars.custom_items.filter((_, i) => i !== index);
    const updated = { ...vars, custom_items: items };
    setVars(updated);
    debouncedSave(updated);
  };

  // Bar widths for timeline and cost visualizations
  const maxWeeks = Math.max(tradWeeks, mmcWks);
  const tradWeeksPct = maxWeeks > 0 ? (tradWeeks / maxWeeks) * 100 : 0;
  const mmcWeeksPct = maxWeeks > 0 ? (mmcWks / maxWeeks) * 100 : 0;

  const maxTrue = Math.max(tradTrue, mmcTrue, 1);
  const tradConstructionPct = (traditionalCost / maxTrue) * 100;
  const tradHoldingPct = (tradHolding / maxTrue) * 100;
  const mmcConstructionPct = (mmcCost / maxTrue) * 100;
  const mmcHoldingPct = (mmcHolding / maxTrue) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-900">
          Time &amp; Holding Cost Calculator
        </h3>
        {saving && (
          <span className="text-xs text-muted-foreground">Saving...</span>
        )}
      </div>

      {/* A) Time Comparison */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Construction Timeline
        </h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{tradWeeks}</p>
            <p className="text-xs text-muted-foreground">Traditional (weeks)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-700">{mmcWks}</p>
            <p className="text-xs text-muted-foreground">MMC (weeks)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{weeksSaved}</p>
            <p className="text-xs text-muted-foreground">
              Weeks Saved ({timeSavingPct}%)
            </p>
          </div>
        </div>
        {/* Timeline bars */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Traditional</span>
              <span>{tradWeeks} wks</span>
            </div>
            <div className="h-3 rounded-full bg-gray-200">
              <div
                className="h-3 rounded-full bg-gray-500 transition-all"
                style={{ width: `${tradWeeksPct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">MMC</span>
              <span>{mmcWks} wks</span>
            </div>
            <div className="h-3 rounded-full bg-gray-200">
              <div
                className="h-3 rounded-full bg-violet-500 transition-all"
                style={{ width: `${mmcWeeksPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* B) Your Holding Costs */}
      <div className="rounded-lg border bg-white p-4 space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your Weekly Holding Costs
        </h4>
        <p className="text-xs text-muted-foreground">
          Enter your weekly costs below to see the true cost of building time.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CostInput
            label="Finance / Interest"
            value={vars.weekly_finance_cost}
            onChange={(v) => updateVar("weekly_finance_cost", v)}
          />
          <CostInput
            label="Site Running Costs"
            value={vars.weekly_site_costs}
            onChange={(v) => updateVar("weekly_site_costs", v)}
          />
          <CostInput
            label="Insurance"
            value={vars.weekly_insurance}
            onChange={(v) => updateVar("weekly_insurance", v)}
          />
          <CostInput
            label="Opportunity Cost (Lost Rent)"
            value={vars.weekly_opportunity_cost}
            onChange={(v) => updateVar("weekly_opportunity_cost", v)}
          />
          <CostInput
            label="Council & Permit Fees"
            value={vars.weekly_council_fees}
            onChange={(v) => updateVar("weekly_council_fees", v)}
          />
        </div>

        {/* Custom items */}
        {vars.custom_items.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">
              Custom Items
            </p>
            {vars.custom_items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    type="text"
                    value={item.label}
                    onChange={(e) => updateCustomItem(idx, "label", e.target.value)}
                    className="h-8 text-sm"
                    placeholder="e.g. Storage rental"
                  />
                </div>
                <div className="w-36">
                  <Label className="text-xs">$/week</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={item.amount || ""}
                      onChange={(e) =>
                        updateCustomItem(idx, "amount", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 text-sm pl-5"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-red-600 hover:text-red-700"
                  onClick={() => removeCustomItem(idx)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addCustomItem} className="text-xs">
          + Add Custom Item
        </Button>

        {weeklyTotal > 0 && (
          <div className="flex items-center justify-between rounded-md bg-violet-50 px-3 py-2 text-sm">
            <span className="text-violet-700 font-medium">
              Total Weekly Holding Cost
            </span>
            <span className="font-bold text-violet-900">
              ${weeklyTotal.toLocaleString()}/wk
            </span>
          </div>
        )}
      </div>

      {/* C) True Cost Comparison */}
      <div className="rounded-lg border bg-white p-4 space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          True Cost Comparison
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Traditional */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Traditional
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Construction</span>
                <span>${traditionalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>Holding ({tradWeeks} wks)</span>
                <span>${Math.round(tradHolding).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>True Total</span>
                <span>${Math.round(tradTrue).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* MMC */}
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-2">
            <p className="text-xs font-semibold text-violet-700 uppercase">
              MMC
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Construction</span>
                <span>${mmcCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>Holding ({mmcWks} wks)</span>
                <span>${Math.round(mmcHolding).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold text-violet-900">
                <span>True Total</span>
                <span>${Math.round(mmcTrue).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Savings breakdown */}
        {weeklyTotal > 0 && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Construction Savings</span>
              <span className="font-medium text-green-800">
                ${constructionSavings.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Holding Cost Savings</span>
              <span className="font-medium text-green-800">
                ${Math.round(holdingSavings).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-green-200 pt-1 font-bold">
              <span className="text-green-800">True Total Savings</span>
              <span className="text-green-900">
                ${Math.round(trueSavings).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Stacked bar chart */}
        {weeklyTotal > 0 && (
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Traditional</span>
                <span>${Math.round(tradTrue).toLocaleString()}</span>
              </div>
              <div className="flex h-5 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="bg-gray-400 transition-all"
                  style={{ width: `${tradConstructionPct}%` }}
                  title={`Construction: $${traditionalCost.toLocaleString()}`}
                />
                <div
                  className="bg-orange-400 transition-all"
                  style={{ width: `${tradHoldingPct}%` }}
                  title={`Holding: $${Math.round(tradHolding).toLocaleString()}`}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">MMC</span>
                <span>${Math.round(mmcTrue).toLocaleString()}</span>
              </div>
              <div className="flex h-5 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="bg-violet-400 transition-all"
                  style={{ width: `${mmcConstructionPct}%` }}
                  title={`Construction: $${mmcCost.toLocaleString()}`}
                />
                <div
                  className="bg-orange-400 transition-all"
                  style={{ width: `${mmcHoldingPct}%` }}
                  title={`Holding: $${Math.round(mmcHolding).toLocaleString()}`}
                />
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-400" /> Construction (Trad)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Construction (MMC)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-orange-400" /> Holding Costs
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CostInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
        <Input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-8 text-sm pl-5"
          placeholder="0"
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">per week</p>
    </div>
  );
}
