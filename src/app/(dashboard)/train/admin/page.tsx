import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllCoursesAdmin } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { COURSE_CATEGORY_LABELS } from "@/lib/train/constants";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";

export default async function TrainAdminPage() {
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

  const courses = await getAllCoursesAdmin();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <Link
        href="/train"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Catalog
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Course Management</h1>
        <Link href="/train/admin/new">
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Plus className="mr-1 h-4 w-4" />
            New Course
          </Button>
        </Link>
      </div>

      {courses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => {
            const statusColor =
              course.status === "published"
                ? "bg-green-600"
                : course.status === "archived"
                  ? "bg-gray-500"
                  : "bg-amber-500";

            return (
              <Card key={course.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {COURSE_CATEGORY_LABELS[course.category] ?? course.category}
                    </Badge>
                    <Badge className={statusColor}>{course.status}</Badge>
                  </div>
                  <CardTitle className="text-base">{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span>{course.lesson_count} lessons</span>
                    <span>{course.enrollment_count} enrolled</span>
                  </div>
                  <Link href={`/train/admin/${course.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Manage
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">No courses yet.</p>
          <Link href="/train/admin/new">
            <Button className="bg-purple-600 hover:bg-purple-700">
              Create your first course
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
