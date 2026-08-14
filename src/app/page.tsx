import Link from "next/link";

const FEATURES = [
  {
    href: "/quotes",
    title: "주가 조회",
    description: "관심 종목의 현재가, 등락률, 거래량을 한눈에 확인합니다.",
  },
  {
    href: "/news",
    title: "뉴스·공시 요약",
    description: "종목 관련 최신 뉴스와 공시를 모아서 보여줍니다.",
  },
  {
    href: "/financials",
    title: "재무 분석",
    description: "PER, PBR, ROE 등 핵심 재무지표로 종목을 분석합니다.",
  },
  {
    href: "/portfolio",
    title: "포트폴리오",
    description: "보유 종목을 입력하면 평가금액과 수익률을 계산해줍니다.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">투자 어시스턴트</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          주식투자에 도움이 되는 시세, 뉴스·공시, 재무지표, 포트폴리오 정보를 한곳에서 확인하세요.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group rounded-lg border border-black/10 dark:border-white/10 p-5 hover:border-black/30 dark:hover:border-white/30 transition-colors bg-white dark:bg-white/[.03]"
          >
            <h2 className="font-medium group-hover:underline">{f.title}</h2>
            <p className="mt-1.5 text-sm text-black/60 dark:text-white/60">
              {f.description}
            </p>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
        <p className="font-medium">안내</p>
        <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
          현재 시세·뉴스·재무 데이터는 데모용 샘플 데이터입니다. 실제 서비스로 사용하려면
          증권사 Open API, DART 전자공시 API 등 데이터 제공처의 API 키를 연결해야 합니다.
        </p>
      </section>
    </div>
  );
}
