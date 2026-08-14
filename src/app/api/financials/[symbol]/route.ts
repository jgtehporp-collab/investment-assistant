import { NextResponse } from "next/server";
import { getFinancialIndicators, getQuote } from "@/lib/marketData";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const quote = getQuote(symbol);
  const indicators = getFinancialIndicators(symbol);
  if (!quote || !indicators) {
    return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ quote, indicators });
}
