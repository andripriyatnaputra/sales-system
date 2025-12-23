import Navbar from "./Navbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="w-full max-w-[1800px] mx-auto p-4">
        {children}
      </main>
    </>
  );
}
