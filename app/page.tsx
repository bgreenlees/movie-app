export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
          Movie Watchlist
        </h1>
        <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
          Your personal movie tracking app
        </p>
      </div>
    </main>
  );
}
