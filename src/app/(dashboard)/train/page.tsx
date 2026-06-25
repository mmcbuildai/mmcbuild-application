import Link from "next/link";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { Button } from "@/components/ui/button";
import { CourseSearch } from "@/components/train/course-search";
import { BetaTaskPanel } from "@/components/beta/beta-task-panel";
import { CourseRequestCard } from "@/components/train/course-request-card";
import { CourseCard } from "@/components/train/course-card";
import { searchCourses } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { GraduationCap, LayoutDashboard, Settings } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";
import { shouldShowComingSoon } from "@/lib/launch-modules";

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; category?: string; difficulty?: string; page?: string }>;
}) {
  const params = await searchParams;

  // Check if user is admin for showing admin button
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    role = profile?.role ?? null;
  }
  const isAdmin = role === "owner" || role === "admin";

  if (shouldShowComingSoon("train", role)) {
    return (
      <ComingSoon
        moduleName="MMC Train"
        description="The MMC Train course catalogue will be available in the next release. We're sourcing micro-credentials from TAFE NSW and other accredited providers before launch."
        Icon={GraduationCap}
      />
    );
  }

  const { courses, total } = await searchCourses({
    query: params.query,
    category: params.category,
    difficulty: params.difficulty,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <BetaTaskPanel moduleId="train" />
        <ExplainerVideo module="train" videoUrl="/videos/train-explainer.mp4" />

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Course Catalog</h2>
          <div className="flex gap-2">
            <Link href="/train/dashboard">
              <Button variant="outline" size="sm">
                <LayoutDashboard className="mr-1 h-3.5 w-3.5" />
                My Learning
              </Button>
            </Link>
            {isAdmin && (
              <Link href="/train/admin">
                <Button variant="outline" size="sm">
                  <Settings className="mr-1 h-3.5 w-3.5" />
                  Admin
                </Button>
              </Link>
            )}
          </div>
        </div>

        <CourseSearch />

        {courses.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
            {total > 12 && (
              <p className="text-sm text-muted-foreground text-center mt-6">
                Showing {courses.length} of {total} courses
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GraduationCap className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">No courses found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {params.query || params.category || params.difficulty
                ? "Try adjusting your search filters."
                : "Courses will appear here once published by an admin."}
            </p>
          </div>
        )}

        <CourseRequestCard />
      </div>
    </div>
  );
}
