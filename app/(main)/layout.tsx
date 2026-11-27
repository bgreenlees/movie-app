import Navbar from "@/components/layout/Navbar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <Navbar />
      <main id="main-content">{children}</main>
    </div>
  );
}
