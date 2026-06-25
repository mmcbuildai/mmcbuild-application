import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Support</h1>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Support
            </CardTitle>
            <CardDescription>For general inquiries and technical issues</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Email us at <a href="mailto:support@mmcbuild.com.au" className="text-primary underline">support@mmcbuild.com.au</a>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              We aim to respond within 24 business hours.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone Support
            </CardTitle>
            <CardDescription>For urgent issues and account inquiries</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Call us on <strong>+61 402 612 471</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Available Monday-Friday, 9am-5pm AEST
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
