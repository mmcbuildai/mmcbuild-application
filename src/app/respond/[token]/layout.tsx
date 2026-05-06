import Image from "next/image";

export default function RespondLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Image
            src="/mmcbuildlogo.png"
            alt="MMC Build"
            width={40}
            height={40}
            className="h-10 w-10 rounded-md"
            priority
          />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">MMC Build</h1>
            <p className="text-xs text-gray-500">Compliance Remediation</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
