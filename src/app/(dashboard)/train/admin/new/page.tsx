import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseForm } from "@/components/train/course-form";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";

export default async function NewCoursePage() {
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/train/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Admin
      </Link>

      <h1 className="text-2xl font-bold mb-6">Create New Course</h1>

      <CourseForm />
    </div>
  );
}
