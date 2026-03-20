import { NextRequest, NextResponse } from "next/server";

const ABR_GUID = process.env.ABR_GUID || "";

export async function GET(req: NextRequest) {
  const abn = req.nextUrl.searchParams.get("abn")?.replace(/\s/g, "");

  if (!abn || !/^\d{11}$/.test(abn)) {
    return NextResponse.json({ error: "ABN must be exactly 11 digits" }, { status: 400 });
  }

  if (!ABR_GUID) {
    return NextResponse.json({ error: "ABR_GUID not configured" }, { status: 500 });
  }

  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&callback=cb&guid=${ABR_GUID}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    const text = await res.text();
    const jsonStr = text.replace(/^cb\(/, "").replace(/\)$/, "");
    const data = JSON.parse(jsonStr);

    if (data.Message && !data.Abn) {
      return NextResponse.json({ error: data.Message }, { status: 404 });
    }
    if (!data.Abn) {
      return NextResponse.json({ error: "ABN not found" }, { status: 404 });
    }

    const businessNames: string[] = [];
    if (Array.isArray(data.BusinessName)) {
      for (const b of data.BusinessName) {
        if (typeof b === "string" && b) businessNames.push(b);
        else if (b?.organisationName) businessNames.push(b.organisationName);
      }
    }

    return NextResponse.json({
      abn: data.Abn,
      abnStatus: data.AbnStatus || "",
      entityName: data.EntityName || "",
      entityType: data.EntityTypeName || "",
      acn: data.Acn || "",
      businessNames,
      state: data.AddressState || "",
      postcode: data.AddressPostcode || "",
    });
  } catch {
    return NextResponse.json({ error: "Failed to look up ABN" }, { status: 500 });
  }
}
