import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <p className="label">404</p>
      <p>That isn&apos;t a case. Case URLs look like /case/0x…escrow/0x…fulfillment.</p>
      <Link className="btn" href="/case">Open a case</Link>
    </div>
  );
}
