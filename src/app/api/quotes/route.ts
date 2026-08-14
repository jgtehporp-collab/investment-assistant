import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/marketData";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  return NextResponse.json({ quotes: listQuotes(query) });
}
