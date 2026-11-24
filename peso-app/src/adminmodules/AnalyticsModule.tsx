
import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  PieChart,
  Pie,
} from "recharts";
import ExportFormatControl from "../components/ExportFormatControl";
import type { ExportRow } from "../services/dataExport";
import { isJobSeekerProfileComplete } from "../services/jobSeekerProfile";

type JobPost = {
  id?: string;
  job_vacancy_id?: string;
  title?: string;
  job_title?: string;
  position?: string;
  status?: string | null;
  [key: string]: any;
};

type Employer = {
  id?: string;
  employer_id?: string;
  company_name?: string;
  [key: string]: any;
};

type JobSeeker = {
  id?: string;
  job_seeker_id?: string;
  full_name?: string;
  email?: string | null;
  contact_no?: string | null;
  birth_date?: string | null;
  resume_url?: string | null;
  verification_status?: string | null;
  registration_details?: unknown;
  [key: string]: any;
};

type ApplicationStatusHistory = {
  status: string;
  changed_at: string;
  is_backfill?: boolean;
};

type Application = {
  id?: string;
  application_id?: string;
  job_seeker_id?: string;
  job_seeker?: JobSeeker | JobSeeker[] | null;
  status?: string;
  application_status?: string;
  date_applied?: string;
  position_title?: string | null;
  applicant_name?: string | null;
  applicant_contact_no?: string | null;
  application_status_history?: ApplicationStatusHistory[];
  [key: string]: any;
};

type DashboardCounts = {
  jobs: number;
  applications: number;
  employers: number;
  jobSeekers: number;
};

type InsightCategory =
  | "month"
  | "job title"
  | "company"
  | "status"
  | "job post status";

type ActionableInsight = {
  title: string;
  finding: string;
  recommendation: string;
};

type ApplicationDateRange = {
  start: string;
  end: string;
};

type ApplicationPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semi-annual"
  | "annual"
  | "year-to-date";

const APPLICATION_PERIOD_OPTIONS: { value: ApplicationPeriod; label: string }[] =
  [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "semi-annual", label: "Semi-Annual" },
    { value: "annual", label: "Annual" },
    { value: "year-to-date", label: "Year-to-Date" },
  ];

type SelectedInsight = {
  category: InsightCategory;
  label: string;
  value: number;
} | null;

type Props = {
  counts: DashboardCounts;
  applications: Application[];
  jobPosts: JobPost[];
  employers: Employer[];
  jobSeekers: JobSeeker[];
  loading: boolean;
  loadError: string;
  realtimeUnavailable?: boolean;

  StatCard: React.ComponentType<{
    title: string;
    value: number;
  }>;

  AnalyticsCard: React.ComponentType<{
    title: string;
    value: number;
  }>;

  SummaryRow: React.ComponentType<{
    label: string;
    value: number;
  }>;
};

const BLUE = "#203F8B";
const RED = "#E3262E";

const tooltipStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "10px",
  fontSize: "12px",
  padding: "8px 12px",
};

const PLACEMENT_REPORT_COLUMNS = [
  "No.",
  "Last Name",
  "First Name",
  "Middle Name",
  "Age",
  "Sex",
  "Contact Number",
  "Position Applied",
  "Qualified",
  "Interviewed",
  "Hired",
  "Date Hired",
];

function getRegistrationDetails(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function hasCompleteJobSeekerProfile(seeker: JobSeeker): boolean {
  return Boolean(
    seeker.full_name?.trim() &&
      seeker.email?.trim() &&
      isJobSeekerProfileComplete(
        seeker.registration_details,
        seeker.resume_url,
      ),
  );
}

function getApplicationStatus(application: Application): string {
  const status = String(
    application.status || application.application_status || "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return status === "interview" ? "interviewed" : status;
}

function splitApplicantName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return { firstName: parts[0] || "—", middleName: "—", lastName: "—" };
  }

  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "—",
    lastName: parts[parts.length - 1],
  };
}

function getAge(birthDate?: string | null): string {
  if (!birthDate) return "—";
  const date = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > date.getMonth() ||
    (today.getMonth() === date.getMonth() &&
      today.getDate() >= date.getDate());
  if (!birthdayHasPassed) age--;

  return age >= 0 ? String(age) : "—";
}

function formatReportDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getApplicationPeriodRange(period: ApplicationPeriod): ApplicationDateRange {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start: Date;

  switch (period) {
    case "daily":
      start = end;
      break;
    case "weekly":
      start = new Date(end);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      break;
    case "monthly":
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      break;
    case "quarterly":
      start = new Date(
        end.getFullYear(),
        Math.floor(end.getMonth() / 3) * 3,
        1,
      );
      break;
    case "semi-annual":
      start = new Date(
        end.getFullYear(),
        Math.floor(end.getMonth() / 6) * 6,
        1,
      );
      break;
    case "annual":
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
      break;
    case "year-to-date":
      start = new Date(end.getFullYear(), 0, 1);
      break;
  }

  return {
    start: formatDateInputValue(start),
    end: formatDateInputValue(end),
  };
}

function createApplicationMonthBuckets(
  range: ApplicationDateRange | null,
) {
  const now = new Date();
  const startParts = range?.start.split("-").map(Number);
  const endParts = range?.end.split("-").map(Number);
  const startDate = startParts
    ? new Date(startParts[0], startParts[1] - 1, 1)
    : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const endDate = endParts
    ? new Date(endParts[0], endParts[1] - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets: { key: string; label: string; value: number }[] = [];

  for (
    let date = startDate;
    date <= endDate;
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  ) {
    const year = date.getFullYear();
    const month = date.getMonth();
    buckets.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      value: 0,
    });
  }

  return buckets;
}

function isFullMonthDateRange(range: ApplicationDateRange): boolean {
  const startDay = Number(range.start.slice(8, 10));
  const endYear = Number(range.end.slice(0, 4));
  const endMonth = Number(range.end.slice(5, 7));
  const endDay = Number(range.end.slice(8, 10));
  const lastDayOfEndMonth = new Date(endYear, endMonth, 0).getDate();

  return startDay === 1 && endDay === lastDayOfEndMonth;
}

export default function AnalyticsModule({
  counts,
  applications,
  jobPosts,
  employers,
  jobSeekers,
  loading,
  loadError,
  realtimeUnavailable = false,
  StatCard,
  AnalyticsCard,
  SummaryRow,
}: Props) {
  const [selectedInsight, setSelectedInsight] =
    useState<SelectedInsight>(null);
  const [applicationStartDate, setApplicationStartDate] = useState("");
  const [applicationEndDate, setApplicationEndDate] = useState("");
  const [applicationDateRange, setApplicationDateRange] =
    useState<ApplicationDateRange | null>(null);
  const [applicationPeriod, setApplicationPeriod] =
    useState<ApplicationPeriod | "">("");
  const applicationsInRange = useMemo(() => {
    if (!applicationDateRange) return applications;

    return applications.filter((application) => {
      const appliedDate = application.date_applied?.slice(0, 10) || "";
      return (
        appliedDate >= applicationDateRange.start &&
        appliedDate <= applicationDateRange.end
      );
    });
  }, [applications, applicationDateRange]);

  const genderBreakdown = useMemo(() => {
    let male = 0;
    let female = 0;

    jobSeekers.forEach((seeker) => {
      if (!hasCompleteJobSeekerProfile(seeker)) return;

      const sex = String(
        getRegistrationDetails(seeker.registration_details).sex || "",
      )
        .trim()
        .toLowerCase();

      if (sex === "male") male++;
      if (sex === "female") female++;
    });

    return [
      { label: "Male", value: male, color: BLUE },
      { label: "Female", value: female, color: RED },
    ];
  }, [jobSeekers]);
  const fourPsBreakdown = useMemo(() => {
    let yes = 0;
    let no = 0;

    jobSeekers.forEach((seeker) => {
      if (!hasCompleteJobSeekerProfile(seeker)) return;

      const answer = getRegistrationDetails(
        seeker.registration_details,
      ).is4PsBeneficiary;
      const normalizedAnswer =
        typeof answer === "boolean"
          ? answer
            ? "yes"
            : "no"
          : String(answer || "")
              .trim()
              .toLowerCase();

      if (normalizedAnswer === "yes") yes++;
      if (normalizedAnswer === "no") no++;
    });

    return [
      { label: "Yes", value: yes, color: BLUE },
      { label: "No", value: no, color: "#94A3B8" },
    ];
  }, [jobSeekers]);
  const fourPsRespondentCount = fourPsBreakdown.reduce(
    (total, item) => total + item.value,
    0,
  );
  const disabilityBreakdown = useMemo(() => {
    const categories = [
      "Visual",
      "Hearing",
      "Speech",
      "Physical",
      "Mental",
      "Other",
      "N/A",
    ];
    const counts = new Map<string, { label: string; value: number }>();
    categories.forEach((label) => {
      counts.set(label.toLowerCase(), { label, value: 0 });
    });

    jobSeekers.forEach((seeker) => {
      if (!hasCompleteJobSeekerProfile(seeker)) return;

      const disability = String(
        getRegistrationDetails(seeker.registration_details).disability || "",
      )
        .trim()
        .toLowerCase();
      const category = counts.get(disability) ?? counts.get("other");
      if (category) category.value++;
    });

    return Array.from(counts.values());
  }, [jobSeekers]);
  const graduateTracking = useMemo(() => {
    const reasonLabels = [
      "New entrant/Fresh graduate",
      "Finished contract",
      "Resigned",
      "Retired",
      "Terminated/Laid off due to calamity",
      "Terminated/Laid off (local)",
      "Terminated/Laid off (abroad)",
      "Other",
      "Not specified",
    ];
    const reasonCounts = new Map<string, { label: string; value: number }>();
    reasonLabels.forEach((label) => {
      reasonCounts.set(label.toLowerCase(), { label, value: 0 });
    });

    const freshGraduateIds = new Set<string>();
    jobSeekers.forEach((seeker) => {
      if (seeker.verification_status?.trim().toLowerCase() !== "verified") {
        return;
      }

      const seekerId = seeker.job_seeker_id || seeker.id;
      const reason = String(
        getRegistrationDetails(seeker.registration_details).unemploymentReason ||
          "",
      )
        .trim()
        .toLowerCase();
      const category =
        reasonCounts.get(reason) ??
        reasonCounts.get(reason ? "other" : "not specified");
      if (category) category.value++;

      if (seekerId && reason === "new entrant/fresh graduate") {
        freshGraduateIds.add(seekerId);
      }
    });

    const latestApplications = new Map<
      string,
      { dateApplied: string; applicationId: string; status: string }
    >();
    applicationsInRange.forEach((application) => {
      const seekerId = application.job_seeker_id;
      if (!seekerId || !freshGraduateIds.has(seekerId)) return;

      const dateApplied = String(application.date_applied || "");
      const applicationId = String(
        application.application_id || application.id || "",
      );
      const current = latestApplications.get(seekerId);
      if (
        !current ||
        dateApplied.localeCompare(current.dateApplied) > 0 ||
        (dateApplied === current.dateApplied &&
          applicationId.localeCompare(current.applicationId) > 0)
      ) {
        latestApplications.set(seekerId, {
          dateApplied,
          applicationId,
          status: getApplicationStatus(application),
        });
      }
    });

    const outcomeCounts = {
      hired: 0,
      rejected: 0,
      otherStatus: 0,
      noApplication: 0,
    };
    freshGraduateIds.forEach((seekerId) => {
      const latest = latestApplications.get(seekerId);
      if (!latest) {
        outcomeCounts.noApplication++;
      } else if (latest.status === "hired") {
        outcomeCounts.hired++;
      } else if (latest.status === "rejected") {
        outcomeCounts.rejected++;
      } else {
        outcomeCounts.otherStatus++;
      }
    });

    const freshGraduateCount = freshGraduateIds.size;
    const percentage = (count: number) =>
      freshGraduateCount ? (count / freshGraduateCount) * 100 : 0;

    return {
      reasonBreakdown: Array.from(reasonCounts.values()),
      freshGraduateCount,
      freshGraduateOutcomeSummary: [
        {
          key: "hired",
          label: "Hired",
          value: outcomeCounts.hired,
          percentage: percentage(outcomeCounts.hired),
          color: "#059669",
        },
        {
          key: "rejected",
          label: "Rejected",
          value: outcomeCounts.rejected,
          percentage: percentage(outcomeCounts.rejected),
          color: RED,
        },
        {
          key: "otherStatus",
          label: "Other statuses",
          value: outcomeCounts.otherStatus,
          percentage: percentage(outcomeCounts.otherStatus),
          color: "#F59E0B",
        },
        {
          key: "noApplication",
          label: "No application",
          value: outcomeCounts.noApplication,
          percentage: percentage(outcomeCounts.noApplication),
          color: "#94A3B8",
        },
      ],
    };
  }, [applicationsInRange, jobSeekers]);

  // APPLICATION STATUS COUNTS

  const pendingApplications = applicationsInRange.filter(
    (application) => {
      return getApplicationStatus(application) === "pending";
    }
  ).length;

  const underReviewApplications = applicationsInRange.filter(
  (application) => {
    return getApplicationStatus(application) === "under_review";
  }
).length;

  const rejectedApplications = applicationsInRange.filter(
    (application) => {
      return getApplicationStatus(application) === "rejected";
    }
  ).length;

  const hiredApplications = applicationsInRange.filter(
    (application) => {
      return getApplicationStatus(application) === "hired";
    }
  ).length;

  const placementApplications = useMemo(
    () =>
      applicationDateRange
        ? [...applicationsInRange].sort((first, second) =>
            String(second.date_applied || "").localeCompare(
              String(first.date_applied || ""),
            ),
          )
        : [],
    [applicationsInRange, applicationDateRange],
  );
  const placementExportRows = useMemo(
    () =>
      placementApplications.map((application, index) => {
        const seeker = Array.isArray(application.job_seeker)
          ? application.job_seeker[0]
          : application.job_seeker;
        const registration = getRegistrationDetails(
          seeker?.registration_details,
        );
        const name = splitApplicantName(
          String(application.applicant_name || seeker?.full_name || ""),
        );
        const history = application.application_status_history || [];
        const confirmedHistory = history.filter(
  (entry) => entry.is_backfill === false
);

const statuses = new Set(
  confirmedHistory.map((entry) =>
    String(entry.status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"),
  ),
);
        const hiredEvent = history
  .filter(
    (entry) =>
      String(entry.status || "").toLowerCase() === "hired" &&
      entry.is_backfill === false
  )
  .sort((first, second) =>
    first.changed_at.localeCompare(second.changed_at),
  )[0];

  const hasIncompleteHistory =
  history.length === 0 ||
  history.some((entry) => entry.is_backfill !== false);

const getStageResult = (wasReached: boolean): string => {
  if (wasReached) return "Yes";

  return hasIncompleteHistory ? "Not Recorded" : "No";
};

        return [
          index + 1,
          registration.lastName || name.lastName,
          registration.firstName || name.firstName,
          registration.middleName || name.middleName,
          getAge(registration.dateOfBirth || seeker?.birth_date),
          registration.sex || seeker?.sex || "—",
          application.applicant_contact_no || seeker?.contact_no || "—",
          application.position_title || "—",
          getStageResult(statuses.has("qualified")),
getStageResult(
  statuses.has("interviewed") || statuses.has("interview")
),
getStageResult(statuses.has("hired")),
hiredEvent
  ? formatReportDate(hiredEvent.changed_at)
  : hasIncompleteHistory
    ? "Not Recorded"
    : "-",
        ];
      }),
    [placementApplications],
  );
  // ANALYTICS DATA

  const analyticsData = useMemo(() => {
    const statuses = [
      { key: "pending", label: "Pending" },
      { key: "under_review", label: "Under Review" },
      { key: "shortlisted", label: "Shortlisted" },
      { key: "qualified", label: "Qualified" },
      { key: "interviewed", label: "Interviewed" },
      { key: "withdrawn", label: "Withdrawn" },
      { key: "hired", label: "You're Hired" },
      { key: "rejected", label: "Rejected" },
    ];

    const monthBuckets = createApplicationMonthBuckets(applicationDateRange);

    const monthlyMap = new Map(
      monthBuckets.map((month) => [month.key, month] as const)
    );

    const titleCounts = new Map<string, number>();
    const companyCounts = new Map<string, number>();

    const statusCounts = new Map<
      string,
      { label: string; value: number }
    >(
      statuses.map((status) => [
        status.key,
        { label: status.label, value: 0 },
      ]),
    );

    // JOB POST STATUS COUNTS

const jobPostStatusCounts = new Map<
  string,
  { label: string; value: number }
>();

jobPosts.forEach((job) => {
  const rawStatus = String(job.status ?? "").trim();

  const normalizedStatus = rawStatus
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const label = normalizedStatus
    ? normalizedStatus.replace(/\b\w/g, (char) =>
        char.toUpperCase()
      )
    : "Unknown";

  const existingStatus =
    jobPostStatusCounts.get(normalizedStatus || "unknown");

  if (existingStatus) {
    existingStatus.value++;
  } else {
    jobPostStatusCounts.set(normalizedStatus || "unknown", {
      label,
      value: 1,
    });
  }
});

    // EMPLOYER LOOKUP

    const employerNames = new Map(
      employers.map((employer) => [
        String(employer.employer_id || ""),
        String(
          employer.name ||
          employer.company_name ||
          employer.business_name ||
          "Unknown Company"
        ),
      ] as const)
    );

    // PROCESS APPLICATIONS

    applicationsInRange.forEach((application) => {
      const month = monthlyMap.get(
        String(application.date_applied || "").slice(0, 7),
      );
      if (month) {
        month.value++;
      }

      const title = String(
        application.position_title ||
        "Unspecified Position"
      ).trim();

      titleCounts.set(
        title,
        (titleCounts.get(title) || 0) + 1
      );

      const company =
        employerNames.get(
          String(application.employer_id || "")
        ) || "Unknown Company";

      companyCounts.set(
        company,
        (companyCounts.get(company) || 0) + 1
      );

      const normalizedStatus = getApplicationStatus(application) || "unknown";
      const currentStatus = statusCounts.get(normalizedStatus);
      if (currentStatus) {
        currentStatus.value++;
      } else {
        const label = normalizedStatus
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
        statusCounts.set(normalizedStatus, { label, value: 1 });
      }
    });

    const allJobTitles = Array.from(titleCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const allCompanies = Array.from(companyCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    return {
      monthlyApplications: monthBuckets,

      allJobTitles,
      topJobTitles: allJobTitles.slice(0, 5),

      allCompanies,
      topCompanies: allCompanies.slice(0, 5),

      statusBreakdown: Array.from(statusCounts.values()),

      jobPostStatusBreakdown: Array.from(
  jobPostStatusCounts.values()
).sort(
  (first, second) =>
    second.value - first.value ||
    first.label.localeCompare(second.label)
),

      availableJobs: jobPosts.filter(
        (job) =>
          String(job.status || "").toLowerCase() === "open"
      ).length,
    };
  }, [applicationDateRange, applicationsInRange, employers, jobPosts]);

  // CHART SELECTION

  const handleChartSelect = (
    category: InsightCategory,
    data: any
  ) => {
    const item = data?.payload ?? data;

    if (!item) return;

    setSelectedInsight({
      category,
      label: String(item.label || ""),
      value: Number(item.value || 0),
    });
  };

  // MONTHLY TREND INSIGHT

  const selectedMonthIndex =
    selectedInsight?.category === "month"
      ? analyticsData.monthlyApplications.findIndex(
          (month) => month.label === selectedInsight.label
        )
      : -1;

  const selectedMonth =
    selectedMonthIndex >= 0
      ? analyticsData.monthlyApplications[selectedMonthIndex]
      : null;
  const selectedMonthIsCurrent =
    !applicationDateRange &&
    selectedMonthIndex === analyticsData.monthlyApplications.length - 1;
  const previousMonth =
    selectedMonthIndex > 0
      ? analyticsData.monthlyApplications[
          selectedMonthIndex - 1
        ]
      : null;
  const canCompareSelectedMonth =
    Boolean(previousMonth) &&
    (applicationDateRange
      ? isFullMonthDateRange(applicationDateRange)
      : !selectedMonthIsCurrent);
  const selectedMonthDifference =
    canCompareSelectedMonth && selectedMonth && previousMonth
      ? selectedMonth.value - previousMonth.value
      : null;

  const monthlyTrendInsight = (() => {
    if (!selectedMonth) return "";

    if (!canCompareSelectedMonth || !previousMonth) {
      return `${selectedMonth.value} ${
        selectedMonth.value === 1
          ? "application was"
          : "applications were"
      } recorded in ${selectedMonth.label}${
        selectedMonthIsCurrent ? " month-to-date" : ""
      }. ${
        applicationDateRange && !isFullMonthDateRange(applicationDateRange)
          ? "Month-to-month comparison is omitted because the selected range contains partial months."
          : previousMonth
            ? "Month-to-month comparison is omitted for this partial period."
            : "No previous month is available in this view for comparison."
      }`;
    }

    const difference =
      selectedMonth.value - previousMonth.value;

    if (difference > 0) {
      return `Applications increased by ${difference} compared with ${previousMonth.label}, from ${previousMonth.value} to ${selectedMonth.value}.`;
    }

    if (difference < 0) {
      return `Applications decreased by ${Math.abs(
        difference
      )} compared with ${previousMonth.label}, from ${previousMonth.value} to ${selectedMonth.value}.`;
    }

    return `Application volume remained unchanged compared with ${previousMonth.label}, with ${selectedMonth.value} applications in both months.`;
  })();

  const totalApplications = applicationsInRange.length;
  const applicationPeriodPhrase = applicationDateRange
    ? "in the selected date range"
    : "in the full dataset";
  const totalJobPosts = jobPosts.length;
  const applicationPeriodTotal = analyticsData.monthlyApplications.reduce(
    (total, month) => total + month.value,
    0,
  );
  const latestMonth =
    analyticsData.monthlyApplications[
      analyticsData.monthlyApplications.length - 1
    ];
  const latestMonthPrevious =
    applicationDateRange &&
    isFullMonthDateRange(applicationDateRange) &&
    analyticsData.monthlyApplications.length > 1
      ? analyticsData.monthlyApplications[
          analyticsData.monthlyApplications.length - 2
        ]
      : null;
  const reviewQueueCount = pendingApplications + underReviewApplications;
  const reviewQueuePercentage = totalApplications
    ? Math.round((reviewQueueCount / totalApplications) * 100)
    : 0;
  const reasonProfileCount = graduateTracking.reasonBreakdown.reduce(
    (total, item) => total + item.value,
    0,
  );
  const leadingReason = graduateTracking.reasonBreakdown.reduce<
    (typeof graduateTracking.reasonBreakdown)[number] | null
  >(
    (leading, item) =>
      item.value > 0 && (!leading || item.value > leading.value)
        ? item
        : leading,
    null,
  );
  const getOutcome = (key: string) =>
    graduateTracking.freshGraduateOutcomeSummary.find(
      (item) => item.key === key,
    ) ?? { value: 0, percentage: 0, label: key };
  const hiredOutcome = getOutcome("hired");
  const rejectedOutcome = getOutcome("rejected");
  const otherStatusOutcome = getOutcome("otherStatus");
  const noApplicationOutcome = getOutcome("noApplication");
  const applicationTrendDifference =
    latestMonth && latestMonthPrevious
      ? latestMonth.value - latestMonthPrevious.value
      : 0;
  const hasApplicationStatusData = analyticsData.statusBreakdown.some(
    (status) => status.value > 0,
  );

  const overviewInsights: ActionableInsight[] = [
    {
      title: "Application activity",
      finding:
        totalApplications === 0
          ? "No application records are available yet, so a monthly trend cannot be established."
          : latestMonth && latestMonthPrevious
            ? `${latestMonth.label} has ${latestMonth.value.toLocaleString()} applications, ${
                applicationTrendDifference > 0
                  ? `up ${applicationTrendDifference.toLocaleString()}`
                  : applicationTrendDifference < 0
                    ? `down ${Math.abs(applicationTrendDifference).toLocaleString()}`
                    : "unchanged"
              } from ${latestMonthPrevious.label} (${latestMonthPrevious.value.toLocaleString()}).`
            : latestMonth
              ? applicationDateRange &&
                !isFullMonthDateRange(applicationDateRange)
                ? `${latestMonth.value.toLocaleString()} applications were received in ${latestMonth.label} within the selected range. Month-to-month comparison is omitted because the range includes partial months.`
                : applicationDateRange
                  ? `${latestMonth.value.toLocaleString()} applications were received in ${latestMonth.label}; select a range covering at least two full months for comparison.`
                  : `${latestMonth.value.toLocaleString()} applications were received in ${latestMonth.label} month-to-date.`
              : `${totalApplications.toLocaleString()} application records are available.`,
      recommendation:
        totalApplications === 0
          ? "Confirm that at least one current vacancy is open and that job seekers can submit applications."
          : applicationDateRange &&
            !isFullMonthDateRange(applicationDateRange)
            ? "For a meaningful month-to-month comparison, select a range beginning on the first day and ending on the last day of a month."
            : applicationDateRange && !latestMonthPrevious
              ? "Select a range covering at least two full months to compare application trends."
              : !applicationDateRange
                ? "Treat the current-month count as month-to-date; compare it with a completed month or use a full-month date range."
            : applicationTrendDifference < 0
            ? "Review open-vacancy count and posting visibility, then compare the next month's applications."
            : applicationTrendDifference > 0
              ? "Check that employers have enough capacity to review the increased application volume."
              : "Keep vacancy information current and monitor whether application activity changes next month.",
    },
    {
      title: "Application review queue",
      finding:
        totalApplications === 0
          ? "The review queue will appear after applications are submitted."
          : `${reviewQueueCount.toLocaleString()} of ${totalApplications.toLocaleString()} applications (${reviewQueuePercentage}%) are pending or under review.`,
      recommendation:
        totalApplications === 0
          ? "Confirm that application submissions are working, then monitor the queue when new records arrive."
          : reviewQueueCount > 0
          ? "Sort pending and under-review applications by date received, then follow up on the oldest records with the responsible employers."
          : "The pending and under-review queue is clear; continue checking new submissions on a regular schedule.",
    },
    {
      title: "Verified job-seeker profile needs",
      finding: leadingReason
        ? `${leadingReason.label} is the most common recorded reason (${leadingReason.value.toLocaleString()} of ${reasonProfileCount.toLocaleString()} verified profiles).`
        : "There are no verified job-seeker profiles with unemployment-reason data yet.",
      recommendation: leadingReason
        ? leadingReason.label === "Not specified"
          ? "Improve completion of the unemployment-reason field during profile verification so support can be targeted using reliable data."
          : leadingReason.label === "Other"
            ? "Review the reasons grouped as Other and refine profile choices or data entry so future support can target the most common needs."
            : `Prioritize job-search support for verified job seekers reporting "${leadingReason.label}", and review this group’s progress in the next reporting period.`
        : "Continue verification and ensure the unemployment-reason field is captured for each verified profile.",
    },
    {
      title: "Fresh-graduate outcomes",
      finding:
        graduateTracking.freshGraduateCount === 0
          ? "No verified fresh-graduate profiles are available to calculate hiring or rejection rates."
        : `Among ${graduateTracking.freshGraduateCount.toLocaleString()} verified fresh graduates, ${hiredOutcome.value.toLocaleString()} (${hiredOutcome.percentage.toFixed(1)}%) are hired and ${rejectedOutcome.value.toLocaleString()} (${rejectedOutcome.percentage.toFixed(1)}%) are rejected; ${otherStatusOutcome.value.toLocaleString()} have another status and ${noApplicationOutcome.value.toLocaleString()} have no application${applicationDateRange ? " in the selected date range" : ""}.`,
      recommendation:
        graduateTracking.freshGraduateCount === 0
          ? "Ensure verified profiles have an accurate unemployment reason so eligible fresh graduates can be tracked."
          : noApplicationOutcome.value > 0
        ? applicationDateRange
          ? `Review the ${noApplicationOutcome.value.toLocaleString()} fresh graduates without an application in this range; check for applications outside the selected period before treating them as never applied.`
          : `Connect the ${noApplicationOutcome.value.toLocaleString()} fresh graduates without applications to relevant open vacancies, then track their outcomes.`
          : otherStatusOutcome.value > 0
            ? `Follow up on the ${otherStatusOutcome.value.toLocaleString()} fresh graduates whose latest application is still in another status, and update the status when employers respond.`
            : rejectedOutcome.value > 0 && hiredOutcome.value === 0
              ? "Review rejection feedback with employers and use recurring qualification gaps to guide graduate preparation."
              : hiredOutcome.value > 0
                ? "Record confirmed placements and review the qualifications and vacancy types associated with successful hires."
                : "Monitor new applications and update their outcomes so hiring and rejection rates remain informative.",
    },
  ];

  const descriptiveExportRows: ExportRow[] = (() => {
    const rows: ExportRow[] = [
      {
        Dataset: "Report scope",
        Metric: applicationDateRange
          ? `${applicationDateRange.start} to ${applicationDateRange.end}`
          : "All available application records",
        Count: "",
        "Share (%)": "",
        Finding:
          "Application data follows the applied date range. Profile demographics and current job-post statuses are unfiltered snapshots.",
        "Recommended action": "",
      },
    ];
    [
      ["Applications", totalApplications],
      ["Job posts", totalJobPosts],
      ["Employers", employers.length],
      ["Job seekers", jobSeekers.length],
    ].forEach(([metric, count]) => {
      rows.push({
        Dataset: "Summary totals",
        Metric: metric,
        Count: count,
        "Share (%)": "",
        Finding: "",
        "Recommended action": "",
      });
    });
    const appendBreakdown = (
      dataset: string,
      items: { label: string; value: number; percentage?: number }[],
      denominator: number,
    ) => {
      items.forEach((item) => {
        rows.push({
          Dataset: dataset,
          Metric: item.label,
          Count: item.value,
          "Share (%)": (
            item.percentage ??
            (denominator ? (item.value / denominator) * 100 : 0)
          ).toFixed(1),
          Finding: "",
          "Recommended action": "",
        });
      });
    };

    appendBreakdown(
      "Monthly applications",
      analyticsData.monthlyApplications,
      applicationPeriodTotal,
    );
    appendBreakdown(
      "Applications by job title",
      analyticsData.allJobTitles,
      totalApplications,
    );
    appendBreakdown(
      "Applications by employer",
      analyticsData.allCompanies,
      totalApplications,
    );
    appendBreakdown(
      "Job-seeker gender",
      genderBreakdown,
      genderBreakdown.reduce((total, item) => total + item.value, 0),
    );
    appendBreakdown(
      "4Ps response",
      fourPsBreakdown,
      fourPsRespondentCount,
    );
    appendBreakdown(
      "Disability category",
      disabilityBreakdown,
      disabilityBreakdown.reduce((total, item) => total + item.value, 0),
    );
    appendBreakdown(
      "Verified job-seeker unemployment reason",
      graduateTracking.reasonBreakdown,
      reasonProfileCount,
    );
    appendBreakdown(
      "Fresh-graduate application outcome",
      graduateTracking.freshGraduateOutcomeSummary,
      graduateTracking.freshGraduateCount,
    );
    appendBreakdown(
      "Application status",
      analyticsData.statusBreakdown,
      totalApplications,
    );
    appendBreakdown(
      "Current job-post status",
      analyticsData.jobPostStatusBreakdown,
      totalJobPosts,
    );

    overviewInsights.forEach((insight) => {
      rows.push({
        Dataset: "Insights and recommendations",
        Metric: insight.title,
        Count: "",
        "Share (%)": "",
        Finding: insight.finding,
        "Recommended action": insight.recommendation,
      });
    });

    return rows;
  })();

  const activeSelectedInsight = (() => {
    if (!selectedInsight) return null;

    const sources = {
      month: analyticsData.monthlyApplications,
      "job title": analyticsData.allJobTitles,
      company: analyticsData.allCompanies,
      status: analyticsData.statusBreakdown,
      "job post status": analyticsData.jobPostStatusBreakdown,
    };
    const currentValue =
      sources[selectedInsight.category].find(
        (item) => item.label === selectedInsight.label,
      )?.value ?? 0;

    return { ...selectedInsight, value: currentValue };
  })();

  const selectedInsightDetails: ActionableInsight | null =
    !activeSelectedInsight
      ? null
      : activeSelectedInsight.category === "month"
        ? {
            title: activeSelectedInsight.label,
            finding: `${monthlyTrendInsight} ${
              applicationPeriodTotal
                ? `${Math.round((activeSelectedInsight.value / applicationPeriodTotal) * 100)}% of applications in ${
                    applicationDateRange ? "the selected date range" : "the six-month view"
                  } were received during this month.`
                : ""
            }`,
            recommendation:
              activeSelectedInsight.value === 0
                ? `Review whether suitable vacancies were open and visible in ${activeSelectedInsight.label}, then check application activity after the next posting cycle.`
                : selectedMonthDifference !== null &&
                    selectedMonthDifference < 0
                  ? `Review vacancy availability and posting visibility after applications fell by ${Math.abs(selectedMonthDifference).toLocaleString()} from ${previousMonth?.label}.`
                  : selectedMonthDifference !== null &&
                      selectedMonthDifference > 0
                    ? `Plan employer follow-up for the ${selectedMonthDifference.toLocaleString()} additional applications compared with ${previousMonth?.label}.`
                    : selectedMonthIsCurrent
                      ? "Treat this figure as month-to-date; compare it with a completed month or apply a full-month date range before drawing a trend conclusion."
                      : "Use this month's count to plan employer follow-up and compare demand with the adjacent months.",
          }
        : activeSelectedInsight.category === "job title"
          ? {
              title: activeSelectedInsight.label,
              finding: `${activeSelectedInsight.value.toLocaleString()} ${
                activeSelectedInsight.value === 1
                  ? "application"
                  : "applications"
              } were received for this position (${totalApplications ? Math.round((activeSelectedInsight.value / totalApplications) * 100) : 0}% of applications ${applicationPeriodPhrase}).`,
              recommendation:
                "Check that the vacancy is still open, review the required qualifications, and coordinate interview capacity with its employer.",
            }
          : activeSelectedInsight.category === "company"
            ? {
                title: activeSelectedInsight.label,
                finding: `${activeSelectedInsight.value.toLocaleString()} ${
                  activeSelectedInsight.value === 1
                    ? "application"
                    : "applications"
                } were submitted to this employer (${totalApplications ? Math.round((activeSelectedInsight.value / totalApplications) * 100) : 0}% of applications ${applicationPeriodPhrase}).`,
                recommendation:
                  "Review this employer’s active vacancies and agree on a timely applicant-review schedule based on the volume received.",
              }
            : activeSelectedInsight.category === "job post status"
              ? {
                  title: activeSelectedInsight.label,
                  finding: `${activeSelectedInsight.value.toLocaleString()} of ${totalJobPosts.toLocaleString()} job posts (${totalJobPosts ? Math.round((activeSelectedInsight.value / totalJobPosts) * 100) : 0}%) are currently marked ${activeSelectedInsight.label}.`,
                  recommendation:
                    activeSelectedInsight.label.toLowerCase() === "open"
                      ? "Confirm open posts still have valid vacancies, current employer contacts, and accurate application instructions."
                      : "Verify that posts in this status are correctly classified; close filled roles or reopen positions that are still accepting applicants.",
                }
              : {
                  title: activeSelectedInsight.label,
                  finding: `${activeSelectedInsight.value.toLocaleString()} of ${totalApplications.toLocaleString()} applications ${applicationPeriodPhrase} (${totalApplications ? Math.round((activeSelectedInsight.value / totalApplications) * 100) : 0}%) currently have this status.`,
                  recommendation:
                    ["pending", "under review"].includes(
                      activeSelectedInsight.label.toLowerCase(),
                    )
                      ? "Sort these applications by date received and follow up on the oldest records with the responsible employers."
                      : ["hired", "you're hired"].includes(
                            activeSelectedInsight.label.toLowerCase(),
                          )
                        ? "Confirm placement details and ensure the successful outcome is recorded in the applicant’s history."
                        : activeSelectedInsight.label.toLowerCase() ===
                            "rejected"
                          ? "Review available employer feedback and look for recurring qualification gaps that can inform job-seeker support."
                          : "Review applications in this stage and update each record when the employer makes a decision.",
                };
  const hasUnappliedApplicationDateRange =
    applicationStartDate !== (applicationDateRange?.start ?? "") ||
    applicationEndDate !== (applicationDateRange?.end ?? "");

  return (
    <div className="space-y-6">
      {/* LOADING */}

      {loading && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          Loading analytics data...
        </div>
      )}

      {/* ERROR */}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Unable to load analytics: {loadError}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-lg font-bold text-slate-800">
              Application Date Filter
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The applied range filters application totals, trends, status and
              demand charts, graduate outcomes, the placement report, and their
              insights. Profile demographics and current job-post/employer
              snapshots remain unfiltered.
            </p>
            <p className="mt-2 text-xs text-slate-500" aria-live="polite">
              {hasUnappliedApplicationDateRange
                ? "Date changes are not applied; analytics still use the last applied range."
                : applicationDateRange
                  ? `Applied: ${formatReportDate(applicationDateRange.start)} – ${formatReportDate(applicationDateRange.end)}`
                  : "No date range applied; application analytics include all available records."}
            </p>
            {realtimeUnavailable && (
              <p
                role="status"
                className="mt-2 text-xs text-amber-700"
              >
                Live database updates are reconnecting; analytics will refresh
                automatically every 30 seconds until restored.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Applied from
              <input
                type="date"
                value={applicationStartDate}
                max={applicationEndDate || undefined}
                onChange={(event) => {
                  setApplicationPeriod("");
                  setApplicationStartDate(event.target.value);
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Quick period
              <select
                aria-label="Filter analytics by period"
                value={applicationPeriod}
                onChange={(event) => {
                  const selectedPeriod = APPLICATION_PERIOD_OPTIONS.find(
                    (option) => option.value === event.target.value,
                  );
                  if (selectedPeriod) {
                    const range = getApplicationPeriodRange(
                      selectedPeriod.value,
                    );
                    setApplicationPeriod(selectedPeriod.value);
                    setApplicationStartDate(range.start);
                    setApplicationEndDate(range.end);
                    setApplicationDateRange(range);
                    setSelectedInsight(null);
                  }
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              >
                <option value="" disabled>
                  Select period
                </option>
                {APPLICATION_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Applied to
              <input
                type="date"
                value={applicationEndDate}
                min={applicationStartDate || undefined}
                onChange={(event) => {
                  setApplicationPeriod("");
                  setApplicationEndDate(event.target.value);
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              />
            </label>
            <button
              type="button"
              disabled={
                !applicationStartDate ||
                !applicationEndDate ||
                applicationStartDate > applicationEndDate
              }
              onClick={() => {
                setApplicationDateRange({
                  start: applicationStartDate,
                  end: applicationEndDate,
                });
                setApplicationPeriod("");
                setSelectedInsight(null);
              }}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply date range
            </button>
            {(applicationStartDate ||
              applicationEndDate ||
              applicationDateRange) && (
              <button
                type="button"
                onClick={() => {
                  setApplicationStartDate("");
                  setApplicationEndDate("");
                  setApplicationDateRange(null);
                  setApplicationPeriod("");
                  setSelectedInsight(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* MAIN STATISTICS */}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

        <ReportStatCard
          icon="jobs"
          title="Total Job Posts"
          value={counts.jobs}
          StatCard={StatCard}
        />

        <ReportStatCard
          icon="employers"
          title="Total Employers"
          value={counts.employers}
          StatCard={StatCard}
        />

        <ReportStatCard
          icon="jobSeekers"
          title="Total Job Seekers"
          value={counts.jobSeekers}
          StatCard={StatCard}
        />

        <ReportStatCard
          icon="applications"
          title={
            applicationDateRange
              ? "Applications in Range"
              : "Total Applications"
          }
          value={applicationsInRange.length}
          StatCard={StatCard}
        />

      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Placement Status Report
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Applicants in the applied date range and whether they reached
              Qualified, Interviewed, and Hired stages.
            </p>
          </div>
        </div>

        {!applicationDateRange ? (
          <p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-500">
            Apply an application date range to view the placement report.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p>
                  Application date range:{" "}
                  {formatReportDate(applicationDateRange.start)}
                  {" – "}
                  {formatReportDate(applicationDateRange.end)}
                </p>
                <p className="mt-1">{placementApplications.length} applicants</p>
              </div>
              {placementApplications.length > 0 && (
                <ExportFormatControl
                  filename={`placement-status-report-${applicationDateRange.start}-to-${applicationDateRange.end}`}
                  columns={PLACEMENT_REPORT_COLUMNS}
                  rows={placementExportRows}
                  buttonLabel="Export report"
                />
              )}
            </div>
            <p className="px-5 pb-3 text-xs text-slate-500">
              Qualified, Interviewed, and Hired show Yes or No based on the available status history. For applications with backfilled history, No means the stage is absent from the available records; it does not confirm whether the stage occurred before tracking began. Date Hired displays a date only when a confirmed, non-backfilled Hired transition exists. If history is incomplete and no confirmed transition exists, it displays Not Recorded.
            </p>
            {placementApplications.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-500">
                No applications were found in this date range.
              </p>
            ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
                <tr>
                  {PLACEMENT_REPORT_COLUMNS.map((column, index) => (
                    <th
                      key={column}
                      className={`px-3 py-3 ${
                        index >= 8 && index <= 10 ? "text-center" : ""
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {placementExportRows.map((row, index) => {
                  const statusCell = (reached: boolean) => (
                    <span
                      className={`inline-flex min-w-10 justify-center rounded-full px-2 py-1 font-bold ${
                        reached
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {reached ? "Yes" : "No"}
                    </span>
                  );

                  return (
                    <tr
                      key={
                        placementApplications[index].application_id ||
                        placementApplications[index].id ||
                        index
                      }
                      className="hover:bg-slate-50"
                    >
                      {row.slice(0, 8).map((value, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={`px-3 py-3 ${
                            cellIndex === 7 ? "max-w-48" : ""
                          }`}
                        >
                          {String(value)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        {statusCell(row[8] === "Yes")}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {statusCell(row[9] === "Yes")}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {statusCell(row[10] === "Yes")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {String(row[11])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}
      </section>

      {/* DESCRIPTIVE ANALYTICS */}

      <section aria-labelledby="descriptive-analytics-title" className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <h2
            id="descriptive-analytics-title"
            className="text-xl font-bold text-slate-800"
          >
            Descriptive Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Counts show the records in each chart; profile and current job-post charts are snapshots. Select a bar for its finding and next step.
          </p>
          </div>
          <ExportFormatControl
            filename={`descriptive-analytics-report-${
              applicationDateRange
                ? `${applicationDateRange.start}-to-${applicationDateRange.end}`
                : "all-data"
            }`}
            columns={[
              "Dataset",
              "Metric",
              "Count",
              "Share (%)",
              "Finding",
              "Recommended action",
            ]}
            rows={loading || loadError ? [] : descriptiveExportRows}
            buttonLabel="Export analytics report"
          />
        </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">

        {/* LEFT: ANALYTICS CHARTS */}

        <div className="grid min-w-0 gap-5 md:grid-cols-6">

          {/* MONTHLY APPLICATION TRENDS */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-6">

            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Monthly Application Trends
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {applicationDateRange
                  ? "Applications in the selected date range, grouped by month."
                  : "Applications received during the last six months."}
              </p>
            </div>

            <div className="h-[320px] w-full">

              <ResponsiveContainer width="100%" height="100%">

                <BarChart
                  data={analyticsData.monthlyApplications}
                  margin={{
                    top: 20,
                    right: 12,
                    left: 5,
                    bottom: 20,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    label={{ value: "Month", position: "insideBottom", offset: -10 }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    label={{ value: "Applications", angle: -90, position: "insideLeft" }}
                  />

                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "#F1F5F9" }}
                  />

                  <Bar
                    dataKey="value"
                    name="Applications"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={55}
                    onClick={(data: any) =>
                      handleChartSelect("month", data)
                    }
                    className="cursor-pointer"
                  >

                    {analyticsData.monthlyApplications.map(
                      (month) => (
                        <Cell
                          key={month.key}
                          fill={
                            selectedInsight?.category === "month" &&
                            selectedInsight.label === month.label
                              ? RED
                              : BLUE
                          }
                        />
                      )
                    )}

                    <LabelList
                      dataKey="value"
                      position="top"
                      fill="#475569"
                      fontSize={12}
                    />

                  </Bar>

                </BarChart>

              </ResponsiveContainer>

            </div>

            <p className="mt-3 text-xs text-slate-500">
              Select a bar to view monthly application insights.
            </p>

          </div>

          {/* TOP 5 JOB TITLES */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">

            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Top 5 Most Applied Job Titles
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Job positions ranked by applications received.
              </p>
            </div>

            {analyticsData.topJobTitles.length === 0 ? (

              <p className="py-8 text-center text-sm text-slate-500">
                No application data available yet.
              </p>

            ) : (

              <div className="h-[220px] w-full">

                <ResponsiveContainer width="100%" height="100%">

                  <BarChart
                    data={analyticsData.topJobTitles}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 30,
                      left: 12,
                      bottom: 5,
                    }}
                  >

                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Applications", position: "insideBottom", offset: -2 }}
                    />

                    <YAxis
                      type="category"
                      dataKey="label"
                      width={145}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                      label={{ value: "Job title", angle: -90, position: "insideLeft" }}
                    />

                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />

                    <Bar
                      dataKey="value"
                      name="Applications"
                      radius={[0, 6, 6, 0]}
                      barSize={19}
                      onClick={(data: any) =>
                        handleChartSelect("job title", data)
                      }
                      className="cursor-pointer"
                    >

                      {analyticsData.topJobTitles.map((job) => (
                        <Cell
                          key={job.label}
                          fill={
                            selectedInsight?.category === "job title" &&
                            selectedInsight.label === job.label
                              ? RED
                              : BLUE
                          }
                        />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            )}

            <p className="mt-3 text-xs text-slate-500">
              Select a job title to view its insights.
            </p>

          </div>

          {/* TOP 5 COMPANIES */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">

            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Top 5 Companies by Applications
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Employers ranked by applications received.
              </p>
            </div>

            {analyticsData.topCompanies.length === 0 ? (

              <p className="py-8 text-center text-sm text-slate-500">
                No company application data available yet.
              </p>

            ) : (

              <div className="h-[220px] w-full">

                <ResponsiveContainer width="100%" height="100%">

                  <BarChart
                    data={analyticsData.topCompanies}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 30,
                      left: 12,
                      bottom: 5,
                    }}
                  >

                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Applications", position: "insideBottom", offset: -2 }}
                    />

                    <YAxis
                      type="category"
                      dataKey="label"
                      width={145}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                      label={{ value: "Employer", angle: -90, position: "insideLeft" }}
                    />

                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />

                    <Bar
                      dataKey="value"
                      name="Applications"
                      radius={[0, 6, 6, 0]}
                      barSize={19}
                      onClick={(data: any) =>
                        handleChartSelect("company", data)
                      }
                      className="cursor-pointer"
                    >

                      {analyticsData.topCompanies.map((company) => (
                        <Cell
                          key={company.label}
                          fill={
                            selectedInsight?.category === "company" &&
                            selectedInsight.label === company.label
                              ? RED
                              : BLUE
                          }
                        />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            )}

            <p className="mt-3 text-xs text-slate-500">
              Select a company to view its insights.
            </p>

          </div>

          {/* JOB SEEKER GENDER DISTRIBUTION */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Job Seeker Gender Distribution
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Male and female job seekers with completed profile details.
              </p>
            </div>

            {genderBreakdown.every((item) => item.value === 0) ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No completed male or female job-seeker profiles are available yet.
              </p>
            ) : (
              <>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderBreakdown}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={46}
                        outerRadius={72}
                        paddingAngle={3}
                      >
                        {genderBreakdown.map((item) => (
                          <Cell key={item.label} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 flex justify-center gap-8">
                  {genderBreakdown.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-800">
                        {item.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* 4PS BENEFICIARY DISTRIBUTION */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                4Ps Beneficiary Status
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Yes and No responses from job seekers with completed profiles.
              </p>
            </div>

            {fourPsRespondentCount === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No completed job-seeker profiles with a 4Ps response are available yet.
              </p>
            ) : (
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(150px,1fr)_minmax(0,1.2fr)]">
                <div className="relative h-[180px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fourPsBreakdown}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={46}
                        outerRadius={72}
                        paddingAngle={3}
                      >
                        {fourPsBreakdown.map((item) => (
                          <Cell key={item.label} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-slate-800">
                      {fourPsRespondentCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500">Profiles</span>
                  </div>
                </div>

                <ul className="space-y-3">
                  {fourPsBreakdown.map((item) => {
                    const percentage = Math.round(
                      (item.value / fourPsRespondentCount) * 100,
                    );

                    return (
                      <li
                        key={item.label}
                        className="flex items-center justify-between gap-3 text-sm text-slate-600"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.label}</span>
                        </span>
                        <span className="font-semibold text-slate-800">
                          {item.value.toLocaleString()} ({percentage}%)
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* JOB SEEKER DISABILITY BREAKDOWN */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Job Seeker Disability Breakdown
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Completed profiles by disability category. N/A is shown separately.
              </p>
            </div>

            {disabilityBreakdown.every((item) => item.value === 0) ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No completed job-seeker profiles with disability information are available yet.
              </p>
            ) : (
              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={disabilityBreakdown}
                    layout="vertical"
                    margin={{ top: 5, right: 35, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Job seekers", position: "insideBottom", offset: -2 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={125}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Job Seekers"
                      radius={[0, 6, 6, 0]}
                      barSize={20}
                    >
                      {disabilityBreakdown.map((item) => (
                        <Cell
                          key={item.label}
                          fill={item.label === "N/A" ? "#94A3B8" : BLUE}
                        />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* VERIFIED JOB SEEKERS BY UNEMPLOYMENT REASON */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-6">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Verified Job Seekers by Unemployment Reason
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Includes all verified job seekers regardless of current employment status. Profiles without a reason are shown as Not specified.
              </p>
            </div>

            {graduateTracking.reasonBreakdown.every((item) => item.value === 0) ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No verified job-seeker profiles are available yet.
              </p>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={graduateTracking.reasonBreakdown}
                    layout="vertical"
                    margin={{ top: 5, right: 35, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Verified job seekers", position: "insideBottom", offset: -2 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={205}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Verified job seekers"
                      radius={[0, 6, 6, 0]}
                      barSize={20}
                    >
                      {graduateTracking.reasonBreakdown.map((item) => (
                        <Cell
                          key={item.label}
                          fill={
                            item.label === "New entrant/Fresh graduate"
                              ? RED
                              : item.label === "Not specified"
                                ? "#94A3B8"
                                : BLUE
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* FRESH GRADUATE APPLICATION OUTCOMES */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-6">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Fresh Graduate Outcome Rates
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {applicationDateRange
                  ? "Each verified fresh graduate is counted once using their latest application in this range; those without an application in range are shown separately."
                  : "Each verified fresh graduate is counted once using their latest application status."}
              </p>
            </div>

            {graduateTracking.freshGraduateCount === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No verified fresh-graduate profiles are available yet.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {graduateTracking.freshGraduateOutcomeSummary.map((item) => (
                  <li
                    key={item.key}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.key === "noApplication" && applicationDateRange
                        ? "No application in range"
                        : item.label}
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-800">
                      {item.percentage.toFixed(1)}%
                    </p>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-label={`${item.label} share`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.percentage}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, item.percentage)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {item.value.toLocaleString()} of{" "}
                      {graduateTracking.freshGraduateCount.toLocaleString()}{" "}
                      verified fresh graduates
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* APPLICATION STATUS BREAKDOWN */}

          <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">

            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Application Status Breakdown
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Distribution of applications across different statuses.
              </p>
            </div>

            {!hasApplicationStatusData ? (
              <div
                aria-live="polite"
                className="flex min-h-[220px] flex-1 flex-col items-center justify-center px-4 py-8 text-center"
              >
                <svg
                  aria-hidden="true"
                  className="h-10 w-10 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8v-6"
                  />
                </svg>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  No applications found for this view
                </p>
                <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
                  {applicationDateRange
                    ? "Adjust or clear the applied date range to check other applications."
                    : "Application status counts will appear here after applications are submitted."}
                </p>
              </div>
            ) : (

              <div className="h-[220px] w-full">

                <ResponsiveContainer width="100%" height="100%">

                  <BarChart
                    data={analyticsData.statusBreakdown}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 35,
                      left: 5,
                      bottom: 5,
                    }}
                  >

                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Applications", position: "insideBottom", offset: -2 }}
                    />

                    <YAxis
                      type="category"
                      dataKey="label"
                      width={125}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />

                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />

                    <Bar
                      dataKey="value"
                      name="Applications"
                      radius={[0, 6, 6, 0]}
                      barSize={19}
                      onClick={(data: any) =>
                        handleChartSelect("status", data)
                      }
                      className="cursor-pointer"
                    >

                      {analyticsData.statusBreakdown.map((status) => (
                        <Cell
                          key={status.label}
                          fill={
                            selectedInsight?.category === "status" &&
                            selectedInsight.label === status.label
                              ? RED
                              : BLUE
                          }
                        />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            )}

            {hasApplicationStatusData && (
              <p className="mt-3 text-xs text-slate-500">
                Select a status to view its insights.
              </p>
            )}

          </div>

          {/* JOB POST STATUS BREAKDOWN */}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">

            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                Job Post Status Breakdown
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Distribution of job posts by current status.
              </p>
            </div>

            {analyticsData.jobPostStatusBreakdown.length === 0 ? (

              <p className="py-8 text-center text-sm text-slate-500">
                No job post status data available yet.
              </p>

            ) : (

              <div className="h-[220px] w-full">

                <ResponsiveContainer width="100%" height="100%">

                  <BarChart
                    data={analyticsData.jobPostStatusBreakdown}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 35,
                      left: 5,
                      bottom: 5,
                    }}
                  >

                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                      label={{ value: "Job posts", position: "insideBottom", offset: -2 }}
                    />

                    <YAxis
                      type="category"
                      dataKey="label"
                      width={125}
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />

                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "#F1F5F9" }}
                    />

                    <Bar
                      dataKey="value"
                      name="Job Posts"
                      radius={[0, 6, 6, 0]}
                      barSize={19}
                      onClick={(data: any) =>
                        handleChartSelect("job post status", data)
                      }
                      className="cursor-pointer"
                    >

                      {analyticsData.jobPostStatusBreakdown.map((status) => (
                        <Cell
                          key={status.label}
                          fill={
                            selectedInsight?.category === "job post status" &&
                            selectedInsight.label === status.label
                              ? RED
                              : BLUE
                          }
                        />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="#475569"
                        fontSize={11}
                      />

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            )}

            <p className="mt-3 text-xs text-slate-500">
              Select a job post status to view its insights.
            </p>

          </div>

        </div>

        {/* RIGHT: SHARED INSIGHT PANEL */}

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-slate-800">
                {activeSelectedInsight
                  ? activeSelectedInsight.label
                  : "Insights & Recommendations"}
              </h3>
            </div>
            {activeSelectedInsight && (
              <button
                type="button"
                onClick={() => setSelectedInsight(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          {activeSelectedInsight && selectedInsightDetails ? (
            <div className="mt-5 space-y-4">
              <section className="rounded-xl bg-slate-50 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Key insight
                </h4>
                <p className="mt-2 text-3xl font-bold text-[#203F8B]">
                  {activeSelectedInsight.value.toLocaleString()}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {selectedInsightDetails.finding}
                </p>
              </section>

              <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                  Recommended action
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-blue-800">
                  {selectedInsightDetails.recommendation}
                </p>
              </section>

              <p className="text-xs capitalize text-slate-500">
                Based on {activeSelectedInsight.category} data
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <section>
                <h4 className="text-sm font-bold text-slate-800">
                  Key findings
                </h4>
                <ul className="mt-3 space-y-3">
                  {overviewInsights.map((insight) => (
                    <li
                      key={insight.title}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {insight.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        {insight.finding}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-800">
                  Recommendations
                </h4>
                <ul className="mt-3 space-y-3">
                  {overviewInsights.map((insight) => (
                    <li
                      key={insight.title}
                      className="border-l-2 border-blue-600 pl-3"
                    >
                      <p className="text-xs font-semibold text-blue-900">
                        {insight.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {insight.recommendation}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
                Select a bar in the application or job-post charts for a focused finding.
              </p>
            </div>
          )}
        </aside>

      </div>
      </section>

      {/* APPLICATION STATISTICS AND SYSTEM SUMMARY */}

      <div className="grid gap-6 xl:grid-cols-2">

        {/* APPLICATION STATISTICS */}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

          <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800">

            <svg
              className="h-5 w-5 text-[#203F8B]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8v-6m4 6V9"
              />
            </svg>

            Application Statistics

          </h4>

          <p className="mt-1 text-sm text-slate-500">
            {applicationDateRange
              ? "Counts reflect applications submitted within the selected date range."
              : "Counts reflect all available applications."}
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">

            <AnalyticsCard
              title="Pending"
              value={pendingApplications}
            />

            <AnalyticsCard
            title="Under Review"
            value={underReviewApplications}
            />

            <AnalyticsCard
              title="Rejected"
              value={rejectedApplications}
            />

            <AnalyticsCard
              title="Hired"
              value={hiredApplications}
            />

          </div>

        </div>

        {/* SYSTEM SUMMARY */}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

          <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800">

            <svg
              className="h-5 w-5 text-[#203F8B]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 6.5h16M4 12h16M4 17.5h10M7 4v5m5-2v5m4-3v5"
              />
            </svg>

            System Summary

          </h4>

          <div className="mt-5 space-y-4">

            <SummaryRow
              label="Registered Employers"
              value={employers.length}
            />

            <SummaryRow
              label="Registered Job Seekers"
              value={jobSeekers.length}
            />

            <SummaryRow
            label="Available Job Posts"
            value={analyticsData.availableJobs}
            />

            <SummaryRow
              label="Applications Recorded"
              value={applications.length}
            />

          </div>

        </div>

      </div>

    </div>
  );
}

// STATISTICS CARD WITH ICON

function ReportStatCard({
  icon,
  title,
  value,
  StatCard,
}: {
  icon: "jobs" | "employers" | "jobSeekers" | "applications";
  title: string;
  value: number;
  StatCard: Props["StatCard"];
}) {
  const iconPaths = {
    jobs: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",

    employers:
      "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01",

    jobSeekers:
      "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M10 3.13a4 4 0 1 1 0 7.75",

    applications:
      "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-7 8 2 2 4-4",
  } satisfies Record<typeof icon, string>;

  const iconColors = {
    jobs: "bg-blue-50 text-[#203F8B]",
    employers: "bg-red-50 text-[#C62832]",
    jobSeekers: "bg-amber-50 text-[#A16207]",
    applications: "bg-blue-50 text-[#203F8B]",
  } satisfies Record<typeof icon, string>;

  return (
    <div className="relative">

      <StatCard
        title={title}
        value={value}
      />

      <span
        className={`pointer-events-none absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl ${iconColors[icon]}`}
      >

        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >

          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d={iconPaths[icon]}
          />

        </svg>

      </span>

    </div>
  );
}
