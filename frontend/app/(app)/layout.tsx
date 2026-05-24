import Navbar from "./Navbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="w-full max-w-[1800px] mx-auto p-3 sm:p-4 md:p-6">
        {children}
      </main>
    </>
  );
}
