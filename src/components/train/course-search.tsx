"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from "@/lib/train/constants";
import { Search } from "lucide-react";

export function CourseSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`/train?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search courses..."
          className="pl-9"
          defaultValue={searchParams.get("query") ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            // Debounce: update after user stops typing
            const timeout = setTimeout(() => updateParams("query", val), 300);
            return () => clearTimeout(timeout);
          }}
        />
      </div>
      <Select
        defaultValue={searchParams.get("category") ?? "all"}
        onValueChange={(v) => updateParams("category", v)}
      >
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {COURSE_CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {COURSE_CATEGORY_LABELS[cat]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        defaultValue={searchParams.get("difficulty") ?? "all"}
        onValueChange={(v) => updateParams("difficulty", v)}
      >
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Difficulty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          {DIFFICULTIES.map((d) => (
            <SelectItem key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
