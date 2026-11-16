export type ApplicationArchiveSection = "active" | "archived";

type ApplicationArchiveFields = {
  status?: string | null;
  application_status?: string | null;
  archived_at?: string | null;
};

const archiveStatuses = new Set([
  "hired",
  "your_hired",
  "youre_hired",
  "you're_hired",
  "rejected",
  "withdrawn",
]);

export function isApplicationArchived(
  application: ApplicationArchiveFields,
): boolean {
  const status = String(
    application.status || application.application_status || "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!archiveStatuses.has(status)) return false;
  return Boolean(application.archived_at);
}
