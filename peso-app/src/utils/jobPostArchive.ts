export type JobPostArchiveFields = {
  deadline?: string | null;
  archive_after?: string | null;
  archived_at?: string | null;
};

function addOneMonth(dateString: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const target = new Date(year, month + 1, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function isJobPostArchived(job: JobPostArchiveFields): boolean {
  if (job.archived_at) return true;

  if (typeof job.archive_after === "string" && job.archive_after) {
    const archiveDate = new Date(job.archive_after);
    if (!Number.isNaN(archiveDate.getTime())) {
      return archiveDate.getTime() <= Date.now();
    }
  }

  if (typeof job.deadline !== "string" || !job.deadline) return false;
  const archiveDate = addOneMonth(job.deadline.slice(0, 10));
  return archiveDate !== null && archiveDate.getTime() <= Date.now();
}
