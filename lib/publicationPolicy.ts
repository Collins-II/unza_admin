export type PublicationKind = "teaching" | "assessment";

export function independentReviewer(reviewer: string, submittedBy: string, creatorIds: string[]) {
  const normalized = reviewer.toLowerCase();
  return normalized !== submittedBy.toLowerCase() && !creatorIds.some((id) => id.toLowerCase() === normalized);
}

export function validPublicationKind(value: unknown): value is PublicationKind {
  return value === "teaching" || value === "assessment";
}
