import { getBetaProgress } from "./actions";
import { BetaDashboard } from "./beta-dashboard";

export default async function BetaPage() {
  const progress = await getBetaProgress();
  return <BetaDashboard initialProgress={progress} />;
}
