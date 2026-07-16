import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Globe, Phone, Shield, Award, User } from "lucide-react";
import { TRADE_TYPE_LABELS, STATE_LABELS } from "@/lib/direct/constants";
import type { Professional, TradeType, AustralianState } from "@/lib/direct/types";

interface ProfileHeaderProps {
  professional: Professional;
  contactButton?: React.ReactNode;
}

export function ProfileHeader({ professional: pro, contactButton }: ProfileHeaderProps) {
  const tradeLabel = TRADE_TYPE_LABELS[pro.trade_type as TradeType] || pro.trade_type;

  return (
    <div className="space-y-4">
      {/* Cover image */}
      {pro.cover_image_url && (
        <div className="h-48 rounded-xl overflow-hidden">
          <img
            src={pro.cover_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Logo */}
        {pro.logo_url ? (
          <img
            src={pro.logo_url}
            alt={pro.company_name}
            className="w-20 h-20 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-amber-700 font-bold text-2xl">
              {pro.company_name.charAt(0)}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{pro.company_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{tradeLabel}</Badge>
                {pro.insurance_verified && (
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    <Shield className="w-3 h-3 mr-1" />
                    Insured
                  </Badge>
                )}
              </div>
            </div>
            {contactButton}
          </div>

          {pro.headline && (
            <p className="text-muted-foreground mt-2">{pro.headline}</p>
          )}

          <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
            {pro.contact_name && (
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                {pro.contact_name}
              </span>
            )}
            {pro.regions.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {pro.regions.map((r: string) => STATE_LABELS[r as AustralianState] || r).join(", ")}
              </span>
            )}
            {pro.website && (
              <a href={pro.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-amber-600">
                <Globe className="w-4 h-4" />
                Website
              </a>
            )}
            {pro.phone && (
              <a href={`tel:${pro.phone}`} className="flex items-center gap-1 hover:text-amber-600">
                <Phone className="w-4 h-4" />
                {pro.phone}
              </a>
            )}
            {pro.years_experience && (
              <span className="flex items-center gap-1">
                <Award className="w-4 h-4" />
                {pro.years_experience} years experience
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span className="font-semibold">
              {pro.avg_rating > 0 ? Number(pro.avg_rating).toFixed(1) : "New"}
            </span>
            {pro.review_count > 0 && (
              <span className="text-sm text-muted-foreground">({pro.review_count} reviews)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
