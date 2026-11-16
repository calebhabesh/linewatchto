import { ArrowRight } from "lucide-react";

/**
 * "Details →" in a Current Service card's bottom-right corner: says the card
 * opens its full details. Decorative (the card itself is the button), and the
 * card's last line wraps short of it (current-service.css).
 */
export function CardDetailsCue() {
  return (
    <span className="card-details-cue" aria-hidden="true">
      Details
      <ArrowRight size={11} strokeWidth={2} />
    </span>
  );
}
