export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      {children}
    </main>
  );
}
