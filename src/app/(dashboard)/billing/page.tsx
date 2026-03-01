import { CreditCard } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and payments
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <CreditCard className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Subscription Management</CardTitle>
          <CardDescription>
            Stripe-powered billing with 60-day free trial.
            Coming in Stage 7.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
