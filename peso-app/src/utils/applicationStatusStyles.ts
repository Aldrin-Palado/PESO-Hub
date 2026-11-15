const APPLICATION_STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  under_review: "bg-blue-100 text-blue-700",
  shortlisted: "bg-indigo-100 text-indigo-700",
  qualified: "bg-violet-100 text-violet-700",
  interviewed: "bg-amber-100 text-amber-700",
  withdrawn: "bg-gray-100 text-gray-600",
  hired: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const APPLICATION_STATUS_ALIASES: Record<string, string> = {
  for_review: "under_review",
  interview: "interviewed",
  your_hired: "hired",
  youre_hired: "hired",
  "you're_hired": "hired",
};

export function getApplicationStatusStyles(status: string): string {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const canonical = APPLICATION_STATUS_ALIASES[normalized] ?? normalized;

  return APPLICATION_STATUS_STYLES[canonical] ?? "bg-slate-100 text-slate-600";
}
