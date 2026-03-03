import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseEditClient } from "@/components/train/course-edit-client";
import { getCourseWithLessons } from "../../actions";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // Guard: admin only
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    redirect("/train");
  }

  const data = await getCourseWithLessons(courseId);
  if (!data) notFound();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/train/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Admin
      </Link>

      <CourseEditClient course={data.course} lessons={data.lessons} />
    </div>
  );
}
