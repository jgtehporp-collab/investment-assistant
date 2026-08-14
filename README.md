# 투자 어시스턴트 (Investment Assistant)

주식투자에 도움이 되는 정보를 한곳에서 제공하는 웹 앱입니다. Next.js(App Router) + TypeScript + Tailwind CSS로 만들었습니다.

## 기능

- **주가 조회** (`/quotes`): 종목명/코드로 검색, 현재가·등락률·거래량·시가총액 확인
- **뉴스·공시 요약** (`/news`): 종목 관련 뉴스와 공시를 모아서 확인
- **재무 분석** (`/financials`): PER, PBR, ROE, EPS, BPS, 배당수익률, 부채비율 확인
- **포트폴리오** (`/portfolio`): 보유 종목(수량·매입단가) 입력 시 평가금액·손익·수익률 자동 계산 (브라우저 localStorage에 저장)

## 시작하기

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 데이터에 대한 안내 (중요)

현재 시세·뉴스·재무지표는 모두 `src/lib/marketData.ts`의 **샘플(mock) 데이터**입니다. 무료로 키 없이 쓸 수 있는 국내 주식 실시간 시세/공시 API가 마땅치 않아, 우선 화면과 기능 구조를 완성해 둔 상태입니다.

실제 데이터로 연결하려면 아래와 같은 제공처의 API 키를 발급받아 `src/lib/marketData.ts`의 함수들(`listQuotes`, `getQuote`, `getFinancialIndicators`, `listNews`)을 실제 API 호출로 교체하면 됩니다. 모든 페이지는 이 파일을 거쳐서만 데이터를 읽으므로, 이 파일만 교체하면 됩니다.

| 용도 | 후보 제공처 |
| --- | --- |
| 실시간 시세 | 한국투자증권 Open API, 키움증권 Open API |
| 공시 | DART(전자공시시스템) OpenAPI |
| 뉴스 | 네이버 뉴스 검색 API, 공공데이터포털 |
| 재무제표 | DART OpenAPI, 공공데이터포털 |

API 키는 `.env.local`에 저장하고(`NEXT_PUBLIC_` 접두사 없이) 서버 라우트(`src/app/api/**/route.ts`)에서만 사용하세요. 브라우저에 노출되면 안 됩니다.

## 프로젝트 구조

```
src/
  app/
    page.tsx           # 홈 대시보드
    quotes/page.tsx     # 주가 조회
    news/page.tsx        # 뉴스·공시
    financials/page.tsx  # 재무 분석
    portfolio/page.tsx   # 포트폴리오 (localStorage)
    api/
      quotes/route.ts
      news/route.ts
      financials/[symbol]/route.ts
  lib/
    marketData.ts   # 데이터 소스 (현재는 mock, 실제 API로 교체 지점)
    types.ts
    useLocalStorage.ts
  components/
    NavBar.tsx
```
