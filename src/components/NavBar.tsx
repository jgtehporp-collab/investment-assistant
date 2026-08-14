"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "홈" },
  { href: "/quotes", label: "주가 조회" },
  { href: "/news", label: "뉴스·공시" },
  { href: "/financials", label: "재무 분석" },
  { href: "/portfolio", label: "포트폴리오" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black sticky top-0 z-10">
      <nav className="max-w-5xl mx-auto flex items-center gap-1 px-4 sm:px-6 h-14 overflow-x-auto">
        <Link href="/" className="font-semibold tracking-tight mr-4 shrink-0">
          투자 어시스턴트
        </Link>
        {LINKS.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
