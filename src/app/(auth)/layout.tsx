export const dynamic = "force-dynamic";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className="mx-auto max-w-md px-6 py-12"><p className="mb-8 text-2xl font-bold">kanbrik.</p>{children}</main>;
}
