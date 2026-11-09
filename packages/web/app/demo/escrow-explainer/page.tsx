import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bench demo" };

/** Static page for the URL-delivery demo case (fixtures/cases/03-url-delivery.json). Keep it unchanged. */
export default function EscrowExplainer() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Bench demo</h1>
      <p>
        An escrow holds money for two parties until a condition is met. The buyer locks the payment, the seller does the work,
        and nobody can take the money early. When the work arrives, someone has to decide whether it meets the agreed terms.
      </p>
      <p>
        In Bench, that decision is judged by a GenLayer jury: several independent validators each read the agreement and the
        delivery, and the escrow releases only if they agree. If the work falls short, the buyer gets the money back after the
        escrow expires.
      </p>
    </article>
  );
}
