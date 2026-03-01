import { ModuleHero } from "@/components/shared/module-hero";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Star, MapPin, Search } from "lucide-react";

const sampleProfessionals = [
  {
    company: "ModularPro Australia",
    type: "Modular Builder",
    location: "Sydney",
    rating: 4.9,
  },
  {
    company: "CLT Structures Co",
    type: "CLT Specialist",
    location: "Melbourne",
    rating: 4.8,
  },
  {
    company: "Green Build Consulting",
    type: "Sustainability",
    location: "Brisbane",
    rating: 4.7,
  },
];

function DirectPreviewCard() {
  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Search className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">
          Search Professionals
        </span>
      </div>
      <div className="space-y-3">
        {sampleProfessionals.map((pro) => (
          <div
            key={pro.company}
            className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4 flex justify-between items-center"
          >
            <div>
              <p className="text-sm font-semibold text-white">{pro.company}</p>
              <p className="text-xs text-white/60">{pro.type}</p>
              <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {pro.location}
              </p>
            </div>
            <div className="flex items-center gap-1 text-amber-400 font-semibold text-sm">
              <Star className="w-4 h-4 fill-amber-400" />
              {pro.rating}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DirectPage() {
  return (
    <div>
      <ModuleHero
        module="direct"
        heading={
          <>
            Find Your{" "}
            <span className="text-amber-400">Perfect</span> Team
          </>
        }
        description="Browse verified builders, architects, suppliers, and trades specialising in modern methods of construction across Australia."
        previewCard={<DirectPreviewCard />}
      />

      <Card className="flex flex-col items-center justify-center py-12">
        <Users className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Trade Directory</CardTitle>
          <CardDescription>
            Browse verified builders, architects, suppliers, and trades
            specialising in MMC methods. Coming in Stage 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
