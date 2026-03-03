import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnrollmentCard } from "@/components/train/enrollment-card";
import { CertificateCard } from "@/components/train/certificate-card";
import { getMyEnrollments, getMyCertificates } from "../actions";
import { ArrowLeft, BookOpen, Award, GraduationCap } from "lucide-react";

export default async function TrainDashboardPage() {
  const [enrollments, certificates] = await Promise.all([
    getMyEnrollments(),
    getMyCertificates(),
  ]);

  const inProgress = enrollments.filter((e) => e.status === "active");
  const completed = enrollments.filter((e) => e.status === "completed");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <Link
        href="/train"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Catalog
      </Link>

      <h1 className="text-2xl font-bold mb-6">My Learning</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="border rounded-lg p-4 flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-purple-600" />
          <div>
            <p className="text-2xl font-bold">{enrollments.length}</p>
            <p className="text-sm text-muted-foreground">Enrolled</p>
          </div>
        </div>
        <div className="border rounded-lg p-4 flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-indigo-600" />
          <div>
            <p className="text-2xl font-bold">{inProgress.length}</p>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </div>
        </div>
        <div className="border rounded-lg p-4 flex items-center gap-3">
          <Award className="h-8 w-8 text-amber-600" />
          <div>
            <p className="text-2xl font-bold">{certificates.length}</p>
            <p className="text-sm text-muted-foreground">Certificates</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">My Courses</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          {enrollments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {enrollments.map((enrollment) => (
                <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t enrolled in any courses yet.
              </p>
              <Link href="/train">
                <Button variant="outline">Browse Courses</Button>
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          {certificates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {certificates.map((cert) => (
                <CertificateCard key={cert.id} certificate={cert} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Award className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                Complete a course to earn your first certificate.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
