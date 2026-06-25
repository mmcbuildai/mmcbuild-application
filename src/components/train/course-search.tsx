"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [isPending, startTransition] = useTransition();

  // Hold the filters locally and apply them only on an explicit Search (or Enter)
  // — the dropdowns no longer fire a navigation on every change.
  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [category, setCategory] = useState(
    searchParams.get("category") ?? "all",
  );
  const [difficulty, setDifficulty] = useState(
    searchParams.get("difficulty") ?? "all",
  );

  const applySearch = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (category && category !== "all") params.set("category", category);
    if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
    // Always start from page 1 on a new search (omit the page param).
    startTransition(() => {
      router.push(`/train?${params.toString()}`);
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search courses..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch();
          }}
        />
      </div>
      <Select value={category} onValueChange={setCategory}>
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
      <Select value={difficulty} onValueChange={setDifficulty}>
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
      <Button
        type="button"
        onClick={applySearch}
        disabled={isPending}
        className="min-h-11 w-full sm:w-auto"
      >
        <Search className="mr-1.5 h-4 w-4" />
        {isPending ? "Searching…" : "Search"}
      </Button>
    </div>
  );
}
