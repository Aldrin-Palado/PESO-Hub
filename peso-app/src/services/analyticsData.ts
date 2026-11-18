import { supabase } from "./supabase";

export type AnalyticsData = {
  applications: unknown[];
  jobPosts: unknown[];
  employers: unknown[];
  jobSeekers: unknown[];
};

export async function fetchAnalyticsData(): Promise<AnalyticsData> {
  const [
    applicationsResult,
    jobsResult,
    employersResult,
    seekersResult,
  ] = await Promise.all([
    (async () => {
      const pageSize = 1000;
      const allApplications: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("application")
          .select(
            "application_id, employer_id, job_seeker_id, position_title, status, date_applied, applicant_name, applicant_contact_no, job_seeker(job_seeker_id, full_name, birth_date, contact_no, registration_details), application_status_history(status, changed_at, is_backfill)",
          )
          .order("application_id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        const pageRows = page ?? [];
        allApplications.push(...pageRows);
        if (pageRows.length === 0) break;
        from += pageRows.length;
      }
      return { data: allApplications, error: null };
    })(),
    (async () => {
      const pageSize = 1000;
      const allJobs: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("job_vacancy")
          .select(
            "job_vacancy_id, employer_id, position_title, status, date_posted, created_at",
          )
          .order("job_vacancy_id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        const pageRows = page ?? [];
        allJobs.push(...pageRows);
        if (pageRows.length === 0) break;
        from += pageRows.length;
      }
      return { data: allJobs, error: null };
    })(),
    (async () => {
      const pageSize = 1000;
      const allEmployers: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("employer")
          .select("employer_id, name, created_at")
          .order("employer_id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        const pageRows = page ?? [];
        allEmployers.push(...pageRows);
        if (pageRows.length === 0) break;
        from += pageRows.length;
      }
      return { data: allEmployers, error: null };
    })(),
    (async () => {
      const pageSize = 1000;
      const allSeekers: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("job_seeker")
          .select(
            "job_seeker_id, full_name, email, verification_status, registration_details, resume_url, created_at",
          )
          .order("job_seeker_id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        const pageRows = page ?? [];
        allSeekers.push(...pageRows);
        if (pageRows.length === 0) break;
        from += pageRows.length;
      }
      return { data: allSeekers, error: null };
    })(),
  ]);

  const errors = [
    applicationsResult.error?.message,
    jobsResult.error?.message,
    employersResult.error?.message,
    seekersResult.error?.message,
  ].filter(Boolean);
  if (errors.length > 0) throw new Error(errors.join(" | "));

  return {
    applications: applicationsResult.data ?? [],
    jobPosts: jobsResult.data ?? [],
    employers: employersResult.data ?? [],
    jobSeekers: seekersResult.data ?? [],
  };
}
