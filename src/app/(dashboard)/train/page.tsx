import { ModuleHero } from "@/components/shared/module-hero";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

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

export default function TrainPage() {
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

      <Card className="flex flex-col items-center justify-center py-12">
        <GraduationCap className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Training Modules</CardTitle>
          <CardDescription>
            Self-paced courses on modern methods of construction with
            completion certificates. Coming in Stage 6.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
