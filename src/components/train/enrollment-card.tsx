import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./progress-bar";
import { COURSE_CATEGORY_LABELS } from "@/lib/train/constants";
import type { EnrollmentWithCourse } from "@/lib/train/types";
import { ArrowRight } from "lucide-react";

interface EnrollmentCardProps {
  enrollment: EnrollmentWithCourse;
}

export function EnrollmentCard({ enrollment }: EnrollmentCardProps) {
  const course = enrollment.course;
  const categoryLabel = COURSE_CATEGORY_LABELS[course.category] ?? course.category;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {categoryLabel}
          </Badge>
          <Badge
            variant={enrollment.status === "completed" ? "default" : "outline"}
            className={enrollment.status === "completed" ? "bg-green-600" : ""}
          >
            {enrollment.status === "completed" ? "Completed" : "In Progress"}
          </Badge>
        </div>
        <CardTitle className="text-base">{course.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ProgressBar value={enrollment.progress_pct} className="mb-3" />
        <Link href={`/train/${course.id}`}>
          <Button variant="outline" size="sm" className="w-full">
            {enrollment.status === "completed" ? "Review" : "Continue"}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
