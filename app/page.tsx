import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-4">서비스 홈</h1>
      <Link href="/rooms" className="block">
        <article className="rounded-xl border p-6 hover:shadow-md transition">
          <h2 className="text-xl font-medium">회의실 예약</h2>
          <p className="text-sm text-gray-500 mt-1">회의실 찾고 시간대를 예약하세요</p>
        </article>
      </Link>
    </main>
  );
}
