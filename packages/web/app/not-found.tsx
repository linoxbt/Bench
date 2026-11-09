import Link from "next/link";
import { Mark } from "@/components/site/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Mark className="h-10 w-10" />
      <p className="eyebrow mt-8">404</p>
      <h1 className="display mt-3 text-[2.6rem] sm:text-[3.4rem]">Nothing on the bench here.</h1>
      <p className="mt-4 max-w-md text-muted">Case URLs look like /case/0x…escrow/0x…fulfillment.</p>
      <div className="mt-8 flex gap-3">
        <Link className="pill pill-primary" href="/">Home</Link>
        <Link className="pill pill-secondary" href="/case">Open a case</Link>
      </div>
    </main>
  );
}
