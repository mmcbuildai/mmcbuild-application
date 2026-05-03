import Link from "next/link";
import { ModuleHero } from "@/components/shared/module-hero";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { Button } from "@/components/ui/button";
import { CourseSearch } from "@/components/train/course-search";
import { CourseCard } from "@/components/train/course-card";
import { searchCourses } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { GraduationCap, LayoutDashboard, Settings } from "lucide-react";

const sampleCourses = [
  { name: "MMC Fundamentals", status: "Completed", progress: 100 },
  { name: "CLT Specialist", status: "In Progress", progress: 70 },
  { name: "Prefab Certification", status: "Upcoming", progress: 5 },
];

function TrainPreviewCard() {
  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <GraduationCap className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">
          Your Learning Path
        </span>
      </div>
      <div className="space-y-3">
        {sampleCourses.map((course) => (
          <div
            key={course.name}
            className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-white">
                {course.name}
              </span>
              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  course.status === "Completed"
                    ? "bg-green-500/20 text-green-400"
                    : course.status === "In Progress"
                      ? "bg-white/10 text-white/70"
                      : "bg-white/10 text-white/50"
                }`}
              >
                {course.status}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full w-full">
              <div
                className={`h-full rounded-full ${
                  course.progress > 50
                    ? "bg-gradient-to-r from-blue-500 to-pink-400"
                    : "bg-white/20"
                }`}
                style={{ width: `${course.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    isAdmin = profile?.role === "owner" || profile?.role === "admin";
  }

  const { courses, total } = await searchCourses({
    query: params.query,
    category: params.category,
    difficulty: params.difficulty,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <div>
      <ModuleHero
        module="train"
        heading={
          <>
            Master{" "}
            <span className="text-purple-400">Modern</span> Construction
          </>
        }
        description="Self-paced courses on modern methods of construction with completion certificates for industry professionals."
        previewCard={<TrainPreviewCard />}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <ExplainerVideo
          module="train"
          videoUrl="/videos/train-explainer.mp4"
          title="Short-form upskilling on Modern Methods of Construction"
          description="Role-targeted modules — designers learn assembly detailing and span tables, certifiers learn pathway differences, builders learn site setup and crane logistics. Each module ~15-20 minutes, with worked examples from real Australian projects."
          bullets={[
            {
              heading: "Pick your role",
              body: "Designers, certifiers, and builders see the modules that actually matter for what they do — not a generic curriculum.",
            },
            {
              heading: "Worked examples",
              body: "Real Australian project case studies, not theory. Span tables, FSR impacts, crane logistics, certifier objections — what to expect, how to handle.",
            },
            {
              heading: "Certificates",
              body: "Pass the quiz, get a certificate to list on your professional profile. Track progress in your Learning Dashboard.",
            },
          ]}
        />

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
      </div>
    </div>
  );
}
