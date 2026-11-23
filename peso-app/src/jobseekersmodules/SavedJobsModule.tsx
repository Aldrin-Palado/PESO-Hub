import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import AppIcon from "../components/AppIcon";
import JobDetailsModal from "../components/JobDetailsModal";
import OfficialPESOBadge from "../components/OfficialPESOBadge";
import { getEmployerProfileLogo } from "../utils/employerProfileLogo";
import type { OpenJobVacancyRow } from "../types/JobVacancy";

type Seeker = {
  job_seeker_id: string;
};

type Job = {
  id: string;
  title: string;
  company: string;
  companyLogoUrl: string | null;
  isPeso: boolean;
  employerVerified: boolean;
  location: string;
  type: string;
  classification: "local" | "international";
  salary: string;
  description: string;
  jobQualifications: string;
  requirements: string;
  vacanciesAvailable: number;
  deadline: string | null;
  datePosted: string | null;
  imageUrl: string | null;
};

type Props = {
  seeker: Seeker;
  onNavigateToJobs: () => void;
  onApplyJob: (jobId: string) => void;
};

export default function SavedJobsModule({
  seeker,
  onNavigateToJobs,
  onApplyJob,
}: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [removingJobId, setRemovingJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    let active = true;

    const loadSavedJobs = async () => {
      setLoading(true);
      setLoadError("");

      try {
        const { data: savedRows, error: savedError } = await supabase
          .from("saved_job")
          .select("job_vacancy_id")
          .eq("job_seeker_id", seeker.job_seeker_id);

        if (savedError) throw savedError;

        const savedIds = [
          ...new Set((savedRows ?? []).map((row) => row.job_vacancy_id)),
        ];

        if (savedIds.length === 0) {
          if (active) {
            setJobs([]);
          }
          return;
        }

        const pageSize = 500;
        const allRows: OpenJobVacancyRow[] = [];

        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .rpc("get_open_job_vacancies")
            .order("date_posted", { ascending: false })
            .order("job_vacancy_id", { ascending: false })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          allRows.push(...((data ?? []) as OpenJobVacancyRow[]));

          if (!data || data.length < pageSize) break;
        }

        const openJobs: Job[] = allRows.map((row) => {
          const salaryMin =
            row.salary_min == null ? null : Number(row.salary_min);
          const salaryMax =
            row.salary_max == null ? null : Number(row.salary_max);

          let salary = "Salary not specified";

          if (salaryMin !== null && salaryMax !== null) {
            salary = `₱${salaryMin.toLocaleString()} - ₱${salaryMax.toLocaleString()}`;
          } else if (salaryMin !== null) {
            salary = `From ₱${salaryMin.toLocaleString()}`;
          } else if (salaryMax !== null) {
            salary = `Up to ₱${salaryMax.toLocaleString()}`;
          }
          if (salaryMin !== null || salaryMax !== null) {
            salary += ` per ${row.salary_period === "yearly" ? "year" : "month"}`;
          }

          return {
            id: row.job_vacancy_id,
            title: row.position_title,
            company: row.employer_name || "Company name not provided",
            companyLogoUrl: getEmployerProfileLogo(
              row.employer_logo_url,
              row.employer_is_peso,
            ),
            isPeso: row.employer_is_peso,
            employerVerified: row.employer_verified,
            location: row.location || "Location not specified",
            type: row.employment_type || "Type not specified",
            classification: row.job_classification,
            salary,
            description: row.description || "No description provided.",
            jobQualifications: row.job_qualifications || "",
            requirements: row.requirements || "",
            vacanciesAvailable: row.vacancies_available,
            deadline: row.deadline,
            datePosted: row.date_posted,
            imageUrl: row.image_url ?? null,
          };
        });

        const savedIdSet = new Set(savedIds);
        const availableSavedJobs = openJobs.filter((job) =>
          savedIdSet.has(job.id)
        );

        if (active) {
          setJobs(availableSavedJobs);
        }
      } catch (error) {
        if (!active) return;

        console.error("Error loading saved jobs:", error);
        setLoadError(
          `Unable to load saved jobs: ${
            error instanceof Error ? error.message : "Unexpected error."
          }`
        );
        setJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSavedJobs();

    return () => {
      active = false;
    };
  }, [seeker.job_seeker_id]);

  const removeSavedJob = async (jobId: string) => {
    if (removingJobId) return;

    setRemovingJobId(jobId);
    setActionError("");

    const { error } = await supabase
      .from("saved_job")
      .delete()
      .eq("job_seeker_id", seeker.job_seeker_id)
      .eq("job_vacancy_id", jobId);

    if (error) {
      console.error("Error removing saved job:", error);
      setActionError(`Unable to remove saved job: ${error.message}`);
      setRemovingJobId(null);
      return;
    }

    setJobs((current) => current.filter((job) => job.id !== jobId));

    if (selectedJob?.id === jobId) {
      setSelectedJob(null);
    }

    setRemovingJobId(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#123B70]">
            Saved Jobs
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review the job opportunities you bookmarked.
          </p>
        </div>

        <span className="text-sm font-semibold text-slate-500">
          {jobs.length} available saved job{jobs.length === 1 ? "" : "s"}
        </span>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {actionError}
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading your saved jobs...
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
        >
          {loadError}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <AppIcon
            name="star"
            className="mx-auto h-10 w-10 text-slate-300"
          />
          <h3 className="mt-3 font-bold text-slate-900">
            No available saved jobs
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Save job opportunities from the Jobs page and they will appear here.
          </p>

          <button
            type="button"
            onClick={onNavigateToJobs}
            className="mt-5 rounded-xl bg-[#0759AE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#064A91]"
          >
            Browse Jobs
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {jobs.map((job) => {
              const postedDate = job.datePosted
                ? new Date(job.datePosted).toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                  })
                : "Recently posted";

              return (
                <article
                  key={job.id}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="px-5 pb-5 pt-5 sm:px-7">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-black text-white ${
                            job.isPeso ? "bg-white" : "bg-[#0759AE]"
                          }`}
                        >
                          {job.companyLogoUrl ? (
                            <img
                              src={job.companyLogoUrl}
                              alt={`${job.company} logo`}
                              className={`h-full w-full ${
                                job.isPeso ? "object-contain" : "object-cover"
                              }`}
                            />
                          ) : (
                            job.company.charAt(0).toUpperCase()
                          )}
                        </div>
                        <p className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-slate-700 sm:text-lg">
                          <span className="truncate">{job.company}</span>
                          {job.isPeso ? (
                            <OfficialPESOBadge />
                          ) : job.employerVerified ? (
                            <span
                              title="Verified employer"
                              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                            >
                              <AppIcon name="check" className="h-3 w-3" />
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="w-full text-center sm:w-40 sm:self-center sm:text-right">
                        <p className="text-[11px] font-medium text-slate-400">
                          {postedDate}
                        </p>
                      </div>
                    </div>
                    <h3 className="mt-3 text-lg font-black leading-snug text-slate-950 sm:text-xl">
                      {job.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="capitalize">{job.classification}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.type}</span>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <AppIcon name="mapPin" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      {job.location}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <AppIcon name="dollar" className="h-3.5 w-3.5 text-slate-500" />
                        {job.salary}
                      </span>
                    </div>
                  </div>

                  {job.imageUrl && (
                    <div className="overflow-hidden border-y border-slate-100 bg-slate-50">
                      <img
                        src={job.imageUrl}
                        alt={`${job.title} job posting`}
                        className="h-56 w-full object-contain sm:h-72"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-3 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                    <p className="text-xs text-slate-500">
                      Online application via portal.
                    </p>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedJob(job)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyJob(job.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0759AE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#064A91]"
                    >
                      Apply
                      <AppIcon name="arrowRight" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSavedJob(job.id)}
                      disabled={removingJobId !== null}
                      aria-label={`Remove ${job.title} from saved jobs`}
                      className="inline-flex items-center justify-center gap-1 rounded-full border border-yellow-300 bg-yellow-50 px-4 py-2.5 text-sm font-semibold text-yellow-700 transition hover:bg-yellow-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      <AppIcon name="star" className="h-4 w-4 fill-current" />
                      {removingJobId === job.id ? "Removing..." : "Saved"}
                    </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {selectedJob && (
        <JobDetailsModal
          job={{
            id: selectedJob.id,
            title: selectedJob.title,
            company: selectedJob.company,
            companyLogoUrl: selectedJob.companyLogoUrl,
            employerIsPeso: selectedJob.isPeso,
            employerVerified: selectedJob.employerVerified,
            location: selectedJob.location,
            employmentType: selectedJob.type,
            classification: selectedJob.classification,
            salary: selectedJob.salary,
            description: selectedJob.description,
            jobQualifications: selectedJob.jobQualifications,
            requirements: selectedJob.requirements,
            openings: selectedJob.vacanciesAvailable,
            deadline: selectedJob.deadline,
            datePosted: selectedJob.datePosted,
            imageUrl: selectedJob.imageUrl,
          }}
          onClose={() => setSelectedJob(null)}
          onAction={() => {
            const jobId = selectedJob.id;
            setSelectedJob(null);
            onApplyJob(jobId);
          }}
          actionLabel="Apply"
        />
      )}
    </div>
  );
}