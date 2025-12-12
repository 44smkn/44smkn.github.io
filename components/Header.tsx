import Link from 'next/link';

export default function Header() {
  return (
    <header className="mb-8 py-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
      <Link href="/" className="text-xl font-bold tracking-tight hover:text-gray-600 transition-colors">
        44smknのブログ
      </Link>
      <nav className="flex gap-6 text-sm font-medium text-gray-600">
        <Link href="/software-engineering" className="hover:text-black transition-colors">
          ソフトウェアエンジニアリング
        </Link>
        <Link href="/readings" className="hover:text-black transition-colors">
          読んだもの
        </Link>
        <Link href="/misc" className="hover:text-black transition-colors">
          雑記
        </Link>
      </nav>
    </header>
  );
}
