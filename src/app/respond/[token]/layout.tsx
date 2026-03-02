export default function RespondLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">MMC Build</h1>
          <p className="text-xs text-gray-500">Compliance Remediation</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
