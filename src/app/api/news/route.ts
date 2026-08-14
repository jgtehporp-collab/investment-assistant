import { NextRequest, NextResponse } from "next/server";
import { listNews } from "@/lib/marketData";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? undefined;
  return NextResponse.json({ news: listNews(symbol) });
}
