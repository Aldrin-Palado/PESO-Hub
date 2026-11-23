import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "../services/supabase";

import AdminSidebar, {
  AdminModule,
} from "../components/AdminSidebar";
import ProfileAvatar from "../components/ProfileAvatar";
import OfficialPESOBadge from "../components/OfficialPESOBadge";

import AdminAccounts from "../adminmodules/ManageAccounts";
import AdminAuditLogsModule, {
  useAdminAuditLogs,
} from "../adminmodules/AdminAuditLogsModule";

import DashboardModule from "../adminmodules/DashboardModule";
import AdminJobPostsModule from "../adminmodules/AdminJobPostsModule";
import EmployersModule, {
  type EmployerFormValues,
  type EmployerVerificationStatus,
} from "../adminmodules/EmployersModule";
import JobSeekersModule, {
  type JobSeekerFormValues,
  type JobSeekerVerificationStatus,
} from "../adminmodules/JobSeekersModule";
import ApplicationsModule from "../adminmodules/ApplicationsModule";
import AnnouncementModule from "../adminmodules/AnnouncementModule";
import PESOPosts from "../adminmodules/PESOPosts";
import AnalyticsModule from "../adminmodules/AnalyticsModule";
import MessagesModule from "../adminmodules/MessagesModule";
import {
  decideApplication as submitApplicationDecision,
  type ApplicationDecisionResult,
} from "../services/applicationDecisions";
import { getEmployerRegistrationChecklist } from "../services/employerRegistration";
import { isJobSeekerProfileComplete } from "../services/jobSeekerProfile";
import JobPostErrorBoundary from "../components/JobPostErrorBoundary";
import { fetchAnalyticsData } from "../services/analyticsData";
import { useUnreadMessages } from "../services/useUnreadMessages";
import {
  parseJobPostEmployerSummaries,
  parseJobSeekerApplicationCounts,
} from "../services/adminDashboardData";
import {
  announcementImageBucket,
  getStoredAnnouncementImagePath,
} from "../utils/announcementImages";

/* ============================================================
   TYPES
============================================================ */

type Account = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  contact_no?: string | null;
  is_active: boolean;
  role: "admin" | "staff";
};

type Permissions = {
  dashboard_overview: boolean;
  analytics: boolean;
  job_posts: boolean;
  job_application: boolean;
  employers: boolean;
  job_seekers: boolean;
  messages: boolean;
  notifications: boolean;
  peso_posts: boolean;
};

/*
 * These interfaces intentionally use common fields.
 * The Supabase queries below use select("*") so the
 * dashboard can display your existing records.
 */

type JobPost = {
  id?: string;
  job_vacancy_id?: string;
  title?: string;
  job_title?: string;
  position?: string;
  position_title?: string;
  employer_id?: string;
  posted_by_user_id?: string | null;
  company_name?: string;
  employer_name?: string;
  location?: string;
  employment_type?: string;
  status?: string;
  description?: string;
  created_at?: string;
  date_posted?: string;
  [key: string]: any;
};

type Employer = {
  id?: string;
  employer_id?: string;
  company_name?: string;
  business_name?: string;
  full_name?: string;
  name?: string;
  email?: string;
  contact_no?: string;
  phone?: string;
  address?: string;
  is_active?: boolean;
  status?: string;
  created_at?: string;
  [key: string]: any;
};

type JobSeeker = {
  id?: string;
  job_seeker_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  contact_no?: string;
  phone?: string;
  address?: string;
  status?: string;
  is_active?: boolean;
  created_at?: string;
  [key: string]: any;
};

type Application = {
  id?: string;
  application_id?: string;
  job_seeker_id?: string;
  employer_id?: string;
  job_vacancy_id?: string;
  is_own_peso_application?: boolean;
  status?: string;
  application_status?: string;
  created_at?: string;
  date_applied?: string;
  position_title?: string | null;
  applicant_name?: string | null;
  applicant_email?: string | null;
  resume_url?: string | null;
  [key: string]: any;
};

type Announcement = {
  id: string;
  title: string;
  message: string;
  image_urls: string[] | null;
  created_at: string;
};

type DashboardMetric = {
  label: string;
  value: number;
};

type MonthlyApplicationPoint = {
  key: string;
  label: string;
  value: number;
};

type DashboardStats = Partial<Record<AdminModule, DashboardMetric[]>>;

async function getDashboardCount(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/* ============================================================
   MAIN DASHBOARD
============================================================ */

export default function AdminDashboard() {
  const [account, setAccount] =
    useState<Account | null>(null);
  const hasUnreadMessages = useUnreadMessages(account?.user_id);

  const [permissions, setPermissions] =
    useState<AdminModule[]>([]);

  const [activePage, setActivePage] =
    useState<AdminModule | "My Profile">("Dashboard");
  const { logs: auditLogs, loadError: auditLogError } = useAdminAuditLogs(
    account?.role === "admin" &&
      (activePage === "Admin Audit Logs" || activePage === "Dashboard"),
    activePage,
  );

  const [loading, setLoading] = useState(true);

  const [counts, setCounts] = useState({
    jobs: 0,
    applications: 0,
    employers: 0,
    jobSeekers: 0,
  });
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({});
  const [monthlyApplicationTrend, setMonthlyApplicationTrend] = useState<
    MonthlyApplicationPoint[]
  >([]);
  const [dashboardStatsError, setDashboardStatsError] = useState("");
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [dashboardRealtimeUnavailable, setDashboardRealtimeUnavailable] =
    useState(false);

  const isAdmin =
    account?.role === "admin";

  const saveAccountProfile = async (
    values: Pick<Account, "full_name" | "contact_no">,
  ) => {
    if (!account) throw new Error("Your account profile is not loaded.");
    if (account.role === "admin") {
      const { data, error } = await supabase
        .from("peso_admin")
        .update({ full_name: values.full_name.trim() })
        .eq("admin_id", account.id)
        .select("full_name")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Your profile was not updated. Please sign in again and try once more.");
      setAccount({ ...account, full_name: data.full_name });
      return;
    }

    const { data, error } = await supabase
      .from("peso_staff")
      .update({
        full_name: values.full_name.trim(),
        contact_no: values.contact_no?.trim() || null,
      })
      .eq("peso_staff_id", account.id)
      .select("full_name, contact_no")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your profile was not updated. Please sign in again and try once more.");
    setAccount({ ...account, ...data });
  };

  /* ============================================================
     DATA FOR MODULES
  ============================================================ */

  const [jobPosts, setJobPosts] =
    useState<JobPost[]>([]);

  const [employers, setEmployers] =
    useState<Employer[]>([]);

  const [jobSeekers, setJobSeekers] =
    useState<JobSeeker[]>([]);

  const [applications, setApplications] =
    useState<Application[]>([]);

  const [moduleLoading, setModuleLoading] =
    useState(false);

  const [moduleError, setModuleError] = useState("");

  const [analyticsLoading, setAnalyticsLoading] =
  useState(false);

  const [analyticsError, setAnalyticsError] =
  useState("");
  const [analyticsRealtimeUnavailable, setAnalyticsRealtimeUnavailable] =
    useState(false);
  const analyticsRequestVersion = useRef(0);

  const [applicationsError, setApplicationsError] =
    useState("");
  const [applicationsRealtimeUnavailable, setApplicationsRealtimeUnavailable] =
    useState(false);
  const [profilesRealtimeUnavailable, setProfilesRealtimeUnavailable] =
    useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementPublishing, setAnnouncementPublishing] = useState(false);

  /* ============================================================
     SEARCH
  ============================================================ */

  const [jobSearch, setJobSearch] = useState("");
  const [employerSearch, setEmployerSearch] = useState("");
  const [jobSeekerSearch, setJobSeekerSearch] = useState("");
  const [applicationSearch, setApplicationSearch] =
    useState("");

  /* ============================================================
     FILTERS
  ============================================================ */

  const [jobStatusFilter, setJobStatusFilter] =
    useState("All");

  const [applicationStatusFilter, setApplicationStatusFilter] =
    useState("All");

  /* ============================================================
     LOAD ACCOUNT
  ============================================================ */

  useEffect(() => {
    loadCurrentAccount();
  }, []);

  /* ============================================================
     LOAD COUNTS
  ============================================================ */

  useEffect(() => {
    if (
      account &&
      (account.role === "admin" || permissions.includes("Dashboard"))
    ) {
      loadDashboardCounts();
    }
  }, [account, permissions]);

  /* ============================================================
     LOAD MODULE DATA
  ============================================================ */

  useEffect(() => {
    if (!account) return;

    if (activePage === "Analytics & Reports") {
  loadAnalyticsData();
}

    if (activePage === "Job Post") {
      loadJobPosts();
    }

    if (activePage === "Employers") {
      loadEmployers();
    }

    if (activePage === "Job Seekers") {
      loadJobSeekers();
    }

    if (activePage === "Applications") {
      loadApplications();
    }

    if (activePage === "Announcement") {
      loadAnnouncements();
    }
  }, [activePage, account]);

  /* ============================================================
     LOAD CURRENT ACCOUNT
  ============================================================ */

  const loadCurrentAccount = async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(
          "Authentication error:",
          authError
        );

        window.location.href = "/login";
        return;
      }

      if (!user) {
        window.location.href = "/login";
        return;
      }

      /* --------------------------------------------------------
         CHECK ADMIN
      -------------------------------------------------------- */

      const {
        data: admin,
        error: adminError,
      } = await supabase
        .from("peso_admin")
        .select("admin_id, user_id, full_name, email, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError) {
        console.error(
          "Admin query error:",
          adminError
        );

        alert(
          `Unable to verify your Admin account: ${adminError.message}`
        );

        return;
      }

      /* --------------------------------------------------------
         ADMIN FOUND
      -------------------------------------------------------- */

      if (admin) {
        if (!admin.is_active) {
          alert(
            "Your Admin account is inactive."
          );

          await supabase.auth.signOut();
          window.location.href = "/login";

          return;
        }

        setAccount({
          id: admin.admin_id,
          user_id: admin.user_id,
          full_name: admin.full_name,
          email: admin.email,
          is_active: admin.is_active,
          role: "admin",
        });

        /*
         * Admin has access to all modules.
         */

        setPermissions([
          "Dashboard",
          "Job Post",
          "Employers",
          "Job Seekers",
          "Applications",
          "Messages",
          "Announcement",
          "PESO Posts",
          "Analytics & Reports",
          "Admin Accounts",
          "Admin Audit Logs",
        ]);

        setLoading(false);
        return;
      }

      /* --------------------------------------------------------
         CHECK STAFF
      -------------------------------------------------------- */

      const {
        data: staff,
        error: staffError,
      } = await supabase
        .from("peso_staff")
        .select(
          `
          peso_staff_id,
          user_id,
          admin_id,
          full_name,
          email,
          contact_no,
          is_active
          `
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffError) {
        console.error(
          "Staff query error:",
          staffError
        );

        alert(
          "Unable to verify your Staff account."
        );

        return;
      }

      if (staff) {
        if (!staff.is_active) {
          alert(
            "Your Staff account is inactive."
          );

          await supabase.auth.signOut();
          window.location.href = "/login";

          return;
        }

        setAccount({
          id: staff.peso_staff_id,
          user_id: staff.user_id,
          full_name: staff.full_name,
          email: staff.email,
          contact_no: staff.contact_no,
          is_active: staff.is_active,
          role: "staff",
        });

        /* ------------------------------------------------------
           STAFF PERMISSIONS
        ------------------------------------------------------ */

        const {
          data: permissionData,
          error: permissionError,
        } = await supabase
          .from("staff_permissions")
          .select(
            `
            dashboard_overview,
            analytics,
            job_posts,
            job_application,
            employers,
            job_seekers,
            messages,
            notifications,
            peso_posts
            `
          )
          .eq(
            "peso_staff_id",
            staff.peso_staff_id
          )
          .maybeSingle();

        if (permissionError) {
          console.error(
            "Permission query error:",
            permissionError
          );

          setPermissions([]);
        } else {
          setPermissions(
            convertPermissions(
              permissionData as Permissions | null
            )
          );
        }

        setLoading(false);
        return;
      }

      /* --------------------------------------------------------
         NO ACCOUNT
      -------------------------------------------------------- */

      alert(
        "Your account does not have access to this system."
      );

      await supabase.auth.signOut();

      window.location.href = "/login";
    } catch (error) {
      console.error(
        "Account loading error:",
        error
      );

      alert(
        "An error occurred while loading your account."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
     CONVERT STAFF PERMISSIONS
  ============================================================ */

  const convertPermissions = (
    permission: Permissions | null
  ): AdminModule[] => {
    if (!permission) return [];

    const result: AdminModule[] = [];

    if (permission.dashboard_overview) {
      result.push("Dashboard");
    }

    if (permission.job_posts) {
      result.push("Job Post");
    }

    if (permission.employers) {
      result.push("Employers");
    }

    if (permission.job_seekers) {
      result.push("Job Seekers");
    }

    if (permission.job_application) {
      result.push("Applications");
    }

    if (permission.messages) {
      result.push("Messages");
    }

    if (permission.notifications) {
      result.push("Announcement");
    }

    if (permission.peso_posts) {
      result.push("PESO Posts");
    }

    if (permission.analytics) {
      result.push("Analytics & Reports");
    }

    return result;
  };

  /* ============================================================
     ACCESS CHECK
  ============================================================ */

  const canAccess = (
    page: AdminModule | "My Profile"
  ) => {
    if (page === "My Profile") {
      return true;
    }

    if (account?.role === "admin") {
      return true;
    }

    if (
      page === "Admin Accounts" ||
      page === "Admin Audit Logs"
    ) {
      return false;
    }

    return permissions.includes(page);
  };

  const loadAnnouncements = async () => {
    const { data, error } = await supabase
      .from("peso_announcements")
      .select("id, title, message, image_urls, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading PESO announcements:", error);
      alert(`Unable to load announcements: ${error.message}`);
      return;
    }

    setAnnouncements((data ?? []) as Announcement[]);
  };

  const createAnnouncement = async (images: File[]): Promise<boolean> => {
    const title = announcementTitle.trim();
    const message = announcementMessage.trim();
    if (!title || !message) {
      alert("Please enter an announcement title and message.");
      return false;
    }

    setAnnouncementPublishing(true);
    const uploadedPaths: string[] = [];
    let cleanupFailed = false;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Unable to verify your account: ${authError.message}`);
      if (!authData.user) {
        throw new Error("Please sign in again before publishing an announcement.");
      }

      const announcementId = crypto.randomUUID();
      const imageUrls: string[] = [];
      for (const [index, image] of images.entries()) {
        const extension = image.type === "image/jpeg"
          ? "jpg"
          : image.type === "image/png"
            ? "png"
            : "webp";
        const path = `${announcementId}/${Date.now()}-${index}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(announcementImageBucket)
          .upload(path, image, {
            cacheControl: "3600",
            upsert: false,
            contentType: image.type,
          });
        if (uploadError) throw new Error(`Could not upload ${image.name}: ${uploadError.message}`);

        uploadedPaths.push(path);
        const { data: publicUrl } = supabase.storage
          .from(announcementImageBucket)
          .getPublicUrl(path);
        imageUrls.push(publicUrl.publicUrl);
      }

      const { data, error } = await supabase
        .from("peso_announcements")
        .insert({
          id: announcementId,
          title,
          message,
          image_urls: imageUrls,
          created_by: authData.user.id,
        })
        .select("id, title, message, image_urls, created_at")
        .single();

      if (error) throw new Error(error.message);

      setAnnouncements((current) => [data as Announcement, ...current]);
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      return true;
    } catch (error) {
      console.error("Error creating PESO announcement:", error);

      if (uploadedPaths.length > 0) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from(announcementImageBucket)
            .remove(uploadedPaths);
          if (cleanupError) {
            cleanupFailed = true;
            console.error("Could not remove incomplete announcement images:", cleanupError);
          }
        } catch (cleanupError) {
          cleanupFailed = true;
          console.error("Could not remove incomplete announcement images:", cleanupError);
        }
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error.";
      alert(
        `Unable to publish announcement: ${errorMessage}${
          cleanupFailed ? " Uploaded images may need to be removed from storage." : ""
        }`,
      );
      return false;
    } finally {
      setAnnouncementPublishing(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    const announcement = announcements.find((item) => item.id === id);
    const { error } = await supabase
      .from("peso_announcements")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting PESO announcement:", error);
      alert(`Unable to delete announcement: ${error.message}`);
      return;
    }

    setAnnouncements((current) =>
      current.filter((announcement) => announcement.id !== id),
    );

    const imagePaths = (announcement?.image_urls ?? [])
      .map(getStoredAnnouncementImagePath)
      .filter((path): path is string => path !== null);
    if (imagePaths.length > 0) {
      try {
        const { error: imageError } = await supabase.storage
          .from(announcementImageBucket)
          .remove(imagePaths);
        if (imageError) throw imageError;
      } catch (imageError) {
        console.error(
          "Announcement deleted, but its images could not be removed:",
          imageError,
        );
        alert("Announcement deleted, but some images could not be removed from storage.");
      }
    }
  };

  /* ============================================================
     DASHBOARD COUNTS
  ============================================================ */

  const loadDashboardCounts = useCallback(async () => {
    if (!account) return;

    setDashboardStatsLoading(true);
    setDashboardStatsError("");
    setMonthlyApplicationTrend([]);
    try {
      const accessibleModules =
        account.role === "admin"
          ? [
              "Job Post",
              "Applications",
              "Employers",
              "Job Seekers",
            ]
          : permissions;
      const nextStats: DashboardStats = {};
      let nextMonthlyApplicationTrend: MonthlyApplicationPoint[] = [];
      const statTasks: Promise<void>[] = [];

      if (accessibleModules.includes("Job Post")) {
        statTasks.push(
          (async () => {
            const [total, open, draft, closed] = await Promise.all([
              getDashboardCount(
                supabase
                  .from("job_vacancy")
                  .select("*", { count: "exact", head: true }),
              ),
              getDashboardCount(
                supabase
                  .from("job_vacancy")
                  .select("*", { count: "exact", head: true })
                  .eq("status", "open"),
              ),
              getDashboardCount(
                supabase
                  .from("job_vacancy")
                  .select("*", { count: "exact", head: true })
                  .eq("status", "draft"),
              ),
              getDashboardCount(
                supabase
                  .from("job_vacancy")
                  .select("*", { count: "exact", head: true })
                  .eq("status", "closed"),
              ),
            ]);
            nextStats["Job Post"] = [
              { label: "Total job posts", value: total },
              { label: "Open", value: open },
              { label: "Draft", value: draft },
              { label: "Closed", value: closed },
            ];
          })(),
        );
      }

      if (accessibleModules.includes("Applications")) {
        statTasks.push(
          (async () => {
            const statuses = [
              ["pending", "Pending"],
              ["under_review", "Under Review"],
              ["shortlisted", "Shortlisted"],
              ["qualified", "Qualified"],
              ["interviewed", "Interviewed"],
              ["hired", "Hired"],
              ["rejected", "Rejected"],
              ["withdrawn", "Withdrawn"],
            ] as const;
            const monthRanges = Array.from({ length: 6 }, (_, index) => {
              const now = new Date();
              const start = new Date(
                Date.UTC(now.getFullYear(), now.getMonth() - (5 - index), 1),
              );
              const end = new Date(
                Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
              );
              return {
                key: start.toISOString().slice(0, 7),
                label: start.toLocaleDateString("en-US", {
                  month: "short",
                  timeZone: "UTC",
                }),
                start: start.toISOString().slice(0, 10),
                end: end.toISOString().slice(0, 10),
              };
            });
            const [total, ...counts] = await Promise.all([
              getDashboardCount(
                supabase
                  .from("application")
                  .select("*", { count: "exact", head: true }),
              ),
              ...statuses.map(([status]) =>
                getDashboardCount(
                  supabase
                    .from("application")
                    .select("*", { count: "exact", head: true })
                    .eq("status", status),
                ),
              ),
              ...monthRanges.map(({ start, end }) =>
                getDashboardCount(
                  supabase
                    .from("application")
                    .select("*", { count: "exact", head: true })
                    .gte("date_applied", start)
                    .lt("date_applied", end),
                ),
              ),
            ]);
            const statusCounts = counts.slice(0, statuses.length);
            nextMonthlyApplicationTrend = monthRanges.map((month, index) => ({
              key: month.key,
              label: month.label,
              value: counts[statuses.length + index],
            }));
            nextStats.Applications = [
              { label: "Total applications", value: total },
              ...statuses.map(([_, label], index) => ({
                label,
                value: statusCounts[index],
              })),
            ];
          })(),
        );
      }

      if (accessibleModules.includes("Employers")) {
        statTasks.push(
          (async () => {
            const [total, verified, pending, notApproved] = await Promise.all([
              getDashboardCount(
                supabase
                  .from("employer")
                  .select("*", { count: "exact", head: true }),
              ),
              getDashboardCount(
                supabase
                  .from("employer")
                  .select("*", { count: "exact", head: true })
                  .eq("verification_status", "verified"),
              ),
              getDashboardCount(
                supabase
                .from("employer")
                .select("*", { count: "exact", head: true })
                .eq("verification_status", "pending"),
              ),
              getDashboardCount(
                supabase
                  .from("employer")
                  .select("*", { count: "exact", head: true })
                  .eq("verification_status", "not_approved"),
              ),
            ]);
            nextStats.Employers = [
              { label: "Total employers", value: total },
              { label: "Verified", value: verified },
              { label: "Pending", value: pending },
              { label: "Not approved", value: notApproved },
            ];
          })(),
        );
      }

      if (accessibleModules.includes("Job Seekers")) {
        statTasks.push(
          (async () => {
            const [total, inactive, applicationCountsResult] =
              await Promise.all([
                getDashboardCount(
                  supabase
                    .from("job_seeker")
                    .select("*", { count: "exact", head: true }),
                ),
                getDashboardCount(
                  supabase
                    .from("job_seeker")
                    .select("*", { count: "exact", head: true })
                    .eq("is_active", false),
                ),
                supabase.rpc("get_job_seeker_application_counts"),
              ]);
            if (applicationCountsResult.error) {
              throw new Error(applicationCountsResult.error.message);
            }
            const applications = parseJobSeekerApplicationCounts(
              applicationCountsResult.data,
            ).reduce((sum, item) => sum + item.application_count, 0);
            nextStats["Job Seekers"] = [
              { label: "Registered job seekers", value: total },
              { label: "Active", value: Math.max(0, total - inactive) },
              { label: "Inactive", value: inactive },
              { label: "Applications submitted", value: applications },
            ];
          })(),
        );
      }

      const results = await Promise.allSettled(statTasks);
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      for (const error of failures) {
        console.error("A dashboard scoreboard could not be loaded:", error);
      }
      setDashboardStats(nextStats);
      setMonthlyApplicationTrend(nextMonthlyApplicationTrend);
      setDashboardStatsError(
        failures.length
          ? failures
              .map((error) =>
                error instanceof Error ? error.message : String(error),
              )
              .join(" | ")
          : "",
      );
    } catch (error) {
      console.error(
        "Dashboard count error:",
        error
      );
      setDashboardStatsError(
        error instanceof Error
          ? error.message
          : "Unable to load dashboard statistics.",
      );
    } finally {
      setDashboardStatsLoading(false);
    }
  }, [account, permissions]);

  useEffect(() => {
    if (
      !account ||
      activePage !== "Dashboard" ||
      (account.role !== "admin" && !permissions.includes("Applications"))
    ) {
      return;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    const channel = supabase
      .channel(`admin-dashboard-applications-${account.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "application",
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void loadDashboardCounts();
          }, 150);
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          if (active) {
            setDashboardRealtimeUnavailable(false);
            void loadDashboardCounts();
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error("Admin dashboard application realtime subscription failed:", {
            status,
            error: subscriptionError,
          });
          if (active) {
            setDashboardRealtimeUnavailable(true);
            if (!fallbackPoll) {
              fallbackPoll = setInterval(() => {
                void loadDashboardCounts();
              }, 5000);
            }
          }
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [account, activePage, loadDashboardCounts, permissions]);

  const loadAnalyticsData = useCallback(async (showLoading = true) => {
  const requestVersion = ++analyticsRequestVersion.current;
  if (showLoading) setAnalyticsLoading(true);
  setAnalyticsError("");

  try {
    const analyticsData = await fetchAnalyticsData();

    if (requestVersion !== analyticsRequestVersion.current) return;

    setApplications(analyticsData.applications as Application[]);
    setJobPosts(analyticsData.jobPosts as JobPost[]);
    setEmployers(analyticsData.employers as Employer[]);
    setJobSeekers(analyticsData.jobSeekers as JobSeeker[]);

    setCounts({
      jobs: analyticsData.jobPosts.length,
      applications: analyticsData.applications.length,
      employers: analyticsData.employers.length,
      jobSeekers: analyticsData.jobSeekers.length,
    });

  } catch (error) {
    if (requestVersion !== analyticsRequestVersion.current) return;

    console.error("Analytics loading error:", error);

    setAnalyticsError(
      error instanceof Error
        ? error.message
        : "Unable to load analytics data."
    );

  } finally {
    if (requestVersion === analyticsRequestVersion.current) {
      setAnalyticsLoading(false);
    }
  }
}, []);

  useEffect(() => {
    if (!account || activePage !== "Analytics & Reports") return;

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadAnalyticsData(false);
      }, 150);
    };
    const channel = supabase
      .channel(`admin-analytics-${account.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_seeker",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "application",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employer",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_vacancy",
        },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          setAnalyticsRealtimeUnavailable(false);
          void loadAnalyticsData(false);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error(
            "Admin analytics realtime subscription failed:",
            { status, error: subscriptionError },
          );
          setAnalyticsRealtimeUnavailable(true);
          if (!fallbackPoll) {
            fallbackPoll = setInterval(() => {
              void loadAnalyticsData(false);
            }, 30000);
          }
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [account, activePage, loadAnalyticsData]);

  /* ============================================================
     JOB POSTS
  ============================================================ */

  const loadJobPosts = useCallback(async (showLoading = true) => {
    if (showLoading) setModuleLoading(true);
    setModuleError("");

    try {
      const [jobsResult, employersResult] = await Promise.all([
        supabase
        .from("job_vacancy")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),
        supabase.rpc("get_job_post_employer_summaries"),
      ]);

      if (jobsResult.error) {
        console.error(
          "Job posts error:",
          jobsResult.error
        );
        setJobPosts([]);
        setModuleError(`Job posts could not be loaded: ${jobsResult.error.message}`);
        return;
      }

      if (employersResult.error) {
        console.error("Job post employer names error:", employersResult.error);
        setModuleError(
          `Job posts loaded, but employer names could not be loaded: ${employersResult.error.message}`,
        );
      }

      const employersById = new Map(
        parseJobPostEmployerSummaries(employersResult.data).map((employer) => [
          employer.employer_id,
          {
            name: employer.name,
            logo_url: employer.logo_url,
            user_id: employer.user_id,
          },
        ]),
      );
      setJobPosts(
        (jobsResult.data ?? []).map((job) => ({
          ...job,
          company_name: employersById.get(job.employer_id)?.name || "",
          employer_logo_url:
            employersById.get(job.employer_id)?.logo_url || null,
          employer_user_id:
            employersById.get(job.employer_id)?.user_id ||
            job.posted_by_user_id ||
            null,
        })),
      );
    } catch (error) {
      console.error("Job posts could not be loaded:", error);
      setJobPosts([]);
      setModuleError(
        error instanceof Error
          ? `Job posts could not be loaded: ${error.message}`
          : "Job posts could not be loaded.",
      );
    } finally {
      if (showLoading) setModuleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!account || activePage !== "Job Post") return;

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadJobPosts(false);
      }, 150);
    };
    const channel = supabase
      .channel(`admin-job-posts-${account.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_vacancy",
        },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          void loadJobPosts(false);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error("Admin job-post realtime subscription failed:", {
            status,
            error: subscriptionError,
          });
          if (!fallbackPoll) {
            fallbackPoll = setInterval(() => {
              void loadJobPosts(false);
            }, 5000);
          }
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [account, activePage, loadJobPosts]);

  /* ============================================================
     EMPLOYERS
  ============================================================ */

  const loadEmployers = async (showLoading = true) => {
    if (showLoading) setModuleLoading(true);
    setModuleError("");

    try {
      const { data, error } = await supabase
        .from("employer")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Employers error:",
          error
        );
        setEmployers([]);
        setModuleError(`Employers could not be loaded: ${error.message}`);
        return;
      }

      setEmployers(data ?? []);
    } finally {
      if (showLoading) setModuleLoading(false);
    }
  };

  /* ============================================================
     JOB SEEKERS
  ============================================================ */

  const loadJobSeekers = async (showLoading = true) => {
    if (showLoading) setModuleLoading(true);
    setModuleError("");

    try {
      const { data, error } = await supabase
        .from("job_seeker")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          "Job seekers error:",
          error
        );
        setJobSeekers([]);
        setModuleError(`Job seekers could not be loaded: ${error.message}`);
        return;
      }

      setJobSeekers(data ?? []);
    } catch (error) {
      console.error("Job seeker records could not be loaded:", error);
      setJobSeekers([]);
      setModuleError(
        error instanceof Error
          ? error.message
          : "Unable to load job seeker records.",
      );
    } finally {
      if (showLoading) setModuleLoading(false);
    }
  };

  const updateEmployer = async (
    employerId: string,
    values: EmployerFormValues,
  ) => {
    const { data, error } = await supabase
      .from("employer")
      .update({
        name: values.name.trim(),
        email: values.email.trim() || null,
        contact_person: values.contact_person.trim() || null,
        contact_no: values.contact_no.trim() || null,
        address: values.address.trim() || null,
      })
      .eq("employer_id", employerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Employer update error:", error);
      throw new Error(`Employer could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error("Employer was not updated because the record no longer exists.");
    }

    setEmployers((current) =>
      current.map((employer) =>
        employer.employer_id === employerId ? data : employer,
      ),
    );
  };

  const updateEmployerStatus = async (
    employerId: string,
    status: EmployerVerificationStatus,
  ) => {
    if (status === "verified") {
      const employer = employers.find(
        (candidate) => candidate.employer_id === employerId,
      );
      if (employer?.verification_refresh_required) {
        throw new Error(
          "The employer must update and resubmit company screening details before it can be verified again.",
        );
      }
      if (
        !employer ||
        !getEmployerRegistrationChecklist(
          employer.registration_details,
          employer.verification_documents,
          employer,
        ).every((item) => item.complete)
      ) {
        throw new Error(
          "Complete all company profile, registration form, certification, and paperwork steps before verifying this employer.",
        );
      }
    }

    const { data, error } = await supabase
      .from("employer")
      .update({
        verification_status: status,
        is_verified: status === "verified",
      })
      .eq("employer_id", employerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Employer verification status update error:", error);
      throw new Error(
        `Employer verification status could not be updated: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        "Employer status was not updated because the record no longer exists.",
      );
    }

    setEmployers((current) =>
      current.map((employer) =>
        employer.employer_id === employerId ? data : employer,
      ),
    );
  };

  const updateEmployerActiveStatus = async (
    employerId: string,
    isActive: boolean,
  ) => {
    const { data, error } = await supabase
      .from("employer")
      .update({ is_active: isActive })
      .eq("employer_id", employerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Employer account status update error:", error);
      throw new Error(`Employer account status could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        "Employer account status was not updated because the record no longer exists.",
      );
    }

    setEmployers((current) =>
      current.map((employer) =>
        employer.employer_id === employerId ? data : employer,
      ),
    );
  };

  const updateJobSeeker = async (
    jobSeekerId: string,
    values: JobSeekerFormValues,
  ) => {
    const { data, error } = await supabase
      .from("job_seeker")
      .update({
        full_name: values.full_name.trim(),
        email: values.email.trim() || null,
        contact_no: values.contact_no.trim() || null,
        address: values.address.trim() || null,
        birth_date: values.birth_date || null,
      })
      .eq("job_seeker_id", jobSeekerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Job seeker update error:", error);
      throw new Error(`Job seeker could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error("Job seeker was not updated because the record no longer exists.");
    }

    setJobSeekers((current) =>
      current.map((jobSeeker) =>
        jobSeeker.job_seeker_id === jobSeekerId ? data : jobSeeker,
      ),
    );
  };

  const updateJobSeekerVerificationStatus = async (
    jobSeekerId: string,
    status: JobSeekerVerificationStatus,
  ) => {
    if (status === "verified") {
      const seeker = jobSeekers.find(
        (jobSeeker) => jobSeeker.job_seeker_id === jobSeekerId,
      );
      if (
        !seeker ||
        !String(seeker.full_name || "").trim() ||
        !String(seeker.email || "").trim() ||
        !isJobSeekerProfileComplete(seeker.registration_details, seeker.resume_url)
      ) {
        throw new Error(
          "Complete the job seeker account, registration form, certification, and resume before verifying this profile.",
        );
      }
    }

    const { data, error } = await supabase
      .from("job_seeker")
      .update({ verification_status: status })
      .eq("job_seeker_id", jobSeekerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Job seeker verification status update error:", error);
      throw new Error(
        `Job seeker verification status could not be updated: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        "Job seeker status was not updated because the record no longer exists.",
      );
    }

    setJobSeekers((current) =>
      current.map((jobSeeker) =>
        jobSeeker.job_seeker_id === jobSeekerId ? data : jobSeeker,
      ),
    );
  };

  const updateJobSeekerActiveStatus = async (
    jobSeekerId: string,
    isActive: boolean,
  ) => {
    const { data, error } = await supabase
      .from("job_seeker")
      .update({ is_active: isActive })
      .eq("job_seeker_id", jobSeekerId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Job seeker account status update error:", error);
      throw new Error(`Job seeker account status could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        "Job seeker account status was not updated because the record no longer exists.",
      );
    }

    setJobSeekers((current) =>
      current.map((jobSeeker) =>
        jobSeeker.job_seeker_id === jobSeekerId ? data : jobSeeker,
      ),
    );
  };

  /* ============================================================
     APPLICATIONS
  ============================================================ */

  const loadApplications = useCallback(async (showLoading = true) => {
    if (showLoading) setModuleLoading(true);
    setApplicationsError("");

    try {
      const [
        applicationsResult,
        seekersResult,
        employersResult,
        jobsResult,
      ] =
        await Promise.all([
          supabase.from("application").select("*"),
          supabase
            .from("job_seeker")
            .select(
              "job_seeker_id, full_name, email, contact_no, address, resume_url, created_at, registration_details, birth_date, is_active",
            )
            .order("created_at", {
              ascending: false,
            }),
          supabase
            .from("employer")
            .select("employer_id, name, logo_url, is_peso"),
          supabase
            .from("job_vacancy")
            .select("job_vacancy_id, position_title, employer_id, posted_by_user_id, requirements, location"),
        ]);

      const seekers = seekersResult.data ?? [];
      const employersById = new Map(
        (employersResult.data ?? []).map((employer) => [
          employer.employer_id,
          {
            name: employer.name,
            logo_url: employer.logo_url,
            is_peso: employer.is_peso,
          },
        ]),
      );
      const pesoEmployerIds = new Set(
        (employersResult.data ?? [])
          .filter((employer) => employer.is_peso)
          .map((employer) => employer.employer_id),
      );
      const jobs = jobsResult.data ?? [];
      const supportingErrors: string[] = [];

      if (seekersResult.error) {
        console.error(
          "Application applicant details error:",
          seekersResult.error,
        );
        supportingErrors.push(
          `Applicant details could not be loaded: ${seekersResult.error.message}`,
        );
      } else {
        setJobSeekers(seekers);
      }
      if (employersResult.error) {
        console.error("Application employers error:", employersResult.error);
        supportingErrors.push(
          `Employer names could not be loaded: ${employersResult.error.message}`,
        );
      }
      if (jobsResult.error) {
        console.error("Application job details error:", jobsResult.error);
        supportingErrors.push(
          `Job requirements could not be loaded: ${jobsResult.error.message}`,
        );
      }

      if (applicationsResult.error) {
        console.error(
          "Applications error:",
          applicationsResult.error,
        );

        setApplications([]);
        setApplicationsError(
          [
            `Unable to load applications: ${applicationsResult.error.message}`,
            ...supportingErrors,
          ].join(" "),
        );

        return;
      }

      const rows = [...(applicationsResult.data ?? [])].sort(
        (first, second) => {
          const firstDate = new Date(
            first.date_applied ||
              first.created_at ||
              first.updated_at ||
              0,
          ).getTime();
          const secondDate = new Date(
            second.date_applied ||
              second.created_at ||
              second.updated_at ||
              0,
          ).getTime();

          return secondDate - firstDate;
        },
      );
      const seekersById = new Map(
        seekers.map((seeker) => [
          seeker.job_seeker_id,
          seeker,
        ]),
      );
      const findJob = (application: Application) =>
        jobs.find((job) =>
          application.job_vacancy_id
            ? job.job_vacancy_id === application.job_vacancy_id
            : job.employer_id === application.employer_id &&
              job.position_title === application.position_title,
        );

      setApplications(
        rows.map((application) => {
          const seeker = seekersById.get(
            application.job_seeker_id,
          );
          const job = findJob(application);

          return {
            ...application,
            applicant_user_id: seeker?.user_id || null,
            applicant_name:
              application.applicant_name ?? seeker?.full_name ?? null,
            applicant_email:
              application.applicant_email ?? seeker?.email ?? null,
            resume_url:
              application.applicant_resume_url ?? seeker?.resume_url ?? null,
            contact_number:
              application.applicant_contact_no ?? seeker?.contact_no ?? null,
            applicant_address:
              application.applicant_address ?? seeker?.address ?? null,
            employer_name:
              employersById.get(application.employer_id)?.name ?? null,
            employer_logo_url:
              employersById.get(application.employer_id)?.logo_url ?? null,
            employer_is_peso:
              employersById.get(application.employer_id)?.is_peso ?? false,
            is_peso_application: pesoEmployerIds.has(application.employer_id),
            is_own_peso_application: Boolean(
              pesoEmployerIds.has(application.employer_id) &&
                job?.posted_by_user_id === account?.user_id,
            ),
            can_update_status: Boolean(
              account &&
                job &&
                pesoEmployerIds.has(application.employer_id) &&
                job.posted_by_user_id === account.user_id &&
                (account.role === "admin" ||
                  permissions.includes("Applications")),
            ),
            job_requirements:
              job?.requirements ?? null,
            job_location:
              job?.location ?? null,
          };
        }),
      );
      setApplicationsError(supportingErrors.join(" "));
    } finally {
      if (showLoading) setModuleLoading(false);
    }
  }, [account, permissions]);

  useEffect(() => {
    if (!account || activePage !== "Applications") return;

    setApplicationsRealtimeUnavailable(false);
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    const channel = supabase
      .channel(`admin-applications-${account.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "application",
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void loadApplications(false);
          }, 150);
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          if (active) {
            setApplicationsRealtimeUnavailable(false);
            void loadApplications(false);
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error(
            "Admin application realtime subscription failed:",
            { status, error: subscriptionError },
          );
          if (active) {
            setApplicationsRealtimeUnavailable(true);
            if (!fallbackPoll) {
              fallbackPoll = setInterval(() => {
                void loadApplications(false);
              }, 5000);
            }
          }
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [account, activePage, loadApplications]);

  useEffect(() => {
    if (!account || (activePage !== "Employers" && activePage !== "Job Seekers")) {
      return;
    }

    setProfilesRealtimeUnavailable(false);
    const table = activePage === "Employers" ? "employer" : "job_seeker";
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    const refreshProfiles = () => {
      if (activePage === "Employers") {
        void loadEmployers(false);
      } else {
        void loadJobSeekers(false);
      }
    };
    const channel = supabase
      .channel(`admin-${table}-profile-updates-${account.user_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            refreshProfiles();
          }, 150);
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          if (active) {
            setProfilesRealtimeUnavailable(false);
            refreshProfiles();
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error(`Admin ${table} realtime subscription failed:`, {
            status,
            error: subscriptionError,
          });
          if (active) {
            setProfilesRealtimeUnavailable(true);
            if (!fallbackPoll) {
              fallbackPoll = setInterval(refreshProfiles, 5000);
            }
          }
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [account, activePage]);

  const updateApplicationStatus = async (
    applicationId: string,
    status: string,
  ) => {
    const { data, error } = await supabase
      .from("application")
      .update({ status })
      .eq("application_id", applicationId)
      .select("application_id")
      .maybeSingle();

    if (error) {
      console.error("Application status update error:", error);
      throw new Error(`Application status could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error("Application was not updated because the record no longer exists.");
    }

    setApplications((current) =>
      current.map((application) =>
        application.application_id === applicationId
          ? { ...application, status, application_status: status }
          : application,
      ),
    );
  };

  const decideApplication = async (
    applicationId: string,
    approved: boolean,
  ): Promise<ApplicationDecisionResult> => {
    const result = await submitApplicationDecision(applicationId, approved);
    setApplications((current) =>
      current.map((application) =>
        application.application_id === applicationId
          ? {
              ...application,
              status: result.status,
              application_status: result.status,
            }
          : application,
      ),
    );
    return result;
  };

  /* ============================================================
     FILTERED EMPLOYERS
  ============================================================ */

  const filteredEmployers = useMemo(() => {
    return employers.filter((employer) => {
      const name =
        employer.name ||
        employer.company_name ||
        employer.business_name ||
        employer.full_name ||
        "";

      return `${name} ${
        employer.email || ""
      } ${employer.address || ""}`
        .toLowerCase()
        .includes(
          employerSearch.toLowerCase()
        );
    });
  }, [employers, employerSearch]);

  /* ============================================================
     FILTERED JOB SEEKERS
  ============================================================ */

  const filteredJobSeekers = useMemo(() => {
    return jobSeekers.filter((seeker) => {
      const name =
        seeker.full_name ||
        `${seeker.first_name || ""} ${
          seeker.last_name || ""
        }`;

      return `${name} ${
        seeker.email || ""
      } ${seeker.contact_no || seeker.phone || ""}`
        .toLowerCase()
        .includes(
          jobSeekerSearch.toLowerCase()
        );
    });
  }, [
    jobSeekers,
    jobSeekerSearch,
  ]);

  /* ============================================================
     PAGE RENDERING
  ============================================================ */

  const renderPage = () => {
    if (!canAccess(activePage)) {
      return <AccessDenied />;
    }

    switch (activePage) {
      /* ========================================================
         DASHBOARD
      ======================================================== */

      case "Dashboard":
        return (
          <DashboardModule
            stats={dashboardStats}
            monthlyApplicationTrend={monthlyApplicationTrend}
            permissions={permissions}
            statsError={dashboardStatsError}
            statsLoading={dashboardStatsLoading}
            realtimeUnavailable={dashboardRealtimeUnavailable}
            account={account}
            logs={auditLogs}
            auditLogError={auditLogError}
            onNavigate={setActivePage}
          />
        );

      /* ========================================================
         JOB POST
      ======================================================== */

      case "Job Post":
        return (
          <JobPostErrorBoundary>
            <AdminJobPostsModule
              jobs={jobPosts}
              loadError={moduleError}
              search={jobSearch}
              setSearch={setJobSearch}
              statusFilter={jobStatusFilter}
              setStatusFilter={setJobStatusFilter}
              loading={moduleLoading}
              StatusBadge={StatusBadge}
              LoadingMessage={LoadingMessage}
              EmptyMessage={EmptyMessage}
              formatDate={formatDate}
            />
          </JobPostErrorBoundary>
        );

      /* ========================================================
         EMPLOYERS
      ======================================================== */

      case "Employers":
        return (
          <EmployersModule
            employers={filteredEmployers}
            loadError={[
              moduleError,
              profilesRealtimeUnavailable
                ? "Live employer updates are reconnecting. This list will refresh automatically."
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            search={employerSearch}
            setSearch={setEmployerSearch}
            loading={moduleLoading}
            onUpdate={updateEmployer}
            onUpdateStatus={updateEmployerStatus}
            onToggleActive={updateEmployerActiveStatus}
            LoadingMessage={LoadingMessage}
            EmptyMessage={EmptyMessage}
          />
        );

      /* ========================================================
         JOB SEEKERS
      ======================================================== */

      case "Job Seekers":
        return (
          <JobSeekersModule
            jobSeekers={filteredJobSeekers}
            loadError={[
              moduleError,
              profilesRealtimeUnavailable
                ? "Live job seeker updates are reconnecting. This list will refresh automatically."
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            search={jobSeekerSearch}
            setSearch={setJobSeekerSearch}
            loading={moduleLoading}
            onUpdate={updateJobSeeker}
            onUpdateVerificationStatus={updateJobSeekerVerificationStatus}
            onToggleActive={updateJobSeekerActiveStatus}
            LoadingMessage={LoadingMessage}
            EmptyMessage={EmptyMessage}
          />
        );

      /* ========================================================
         APPLICATIONS
      ======================================================== */

      case "Applications":
        return (
          <ApplicationsModule
            applications={applications}
            loadError={[
              applicationsError,
              applicationsRealtimeUnavailable
                ? "Live application updates are reconnecting. This list will refresh automatically."
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            search={applicationSearch}
            setSearch={setApplicationSearch}
            statusFilter={applicationStatusFilter}
            setStatusFilter={setApplicationStatusFilter}
            loading={moduleLoading}
            canDecideApplications={isAdmin}
            onUpdateStatus={updateApplicationStatus}
            onDecideApplication={decideApplication}
            LoadingMessage={LoadingMessage}
            EmptyMessage={EmptyMessage}
            formatDate={formatDate}
          />
        );

      case "Messages":
        return <MessagesModule />;

      case "Announcement":
        return (
          <AnnouncementModule
            title={announcementTitle}
            setTitle={setAnnouncementTitle}
            message={announcementMessage}
            setMessage={setAnnouncementMessage}
            announcements={announcements}
            isPublishing={announcementPublishing}
            onCreate={createAnnouncement}
            onDelete={(id) => void deleteAnnouncement(id)}
            EmptyMessage={EmptyMessage}
            formatDate={formatDate}
          />
        );

      /* ========================================================
         PESO POSTS
      ======================================================== */

      case "PESO Posts":
        return <PESOPosts />;

      /* ========================================================
         ANALYTICS
      ======================================================== */

      case "Analytics & Reports":
        return (
          <AnalyticsModule
            counts={counts}
            applications={applications}
            jobPosts={jobPosts}
            employers={employers}
            jobSeekers={jobSeekers}
            loading={analyticsLoading}
            loadError={analyticsError}
            realtimeUnavailable={analyticsRealtimeUnavailable}
            StatCard={StatCard}
            AnalyticsCard={AnalyticsCard}
            SummaryRow={SummaryRow}
          />
        );

      /* ========================================================
         ADMIN ACCOUNTS
      ======================================================== */

      case "Admin Accounts":
        if (
          account?.role !==
          "admin"
        ) {
          return <AccessDenied />;
        }

        return <AdminAccounts />;

      case "Admin Audit Logs":
        if (account?.role !== "admin") {
          return <AccessDenied />;
        }

        return (
          <AdminAuditLogsModule
            logs={auditLogs}
            loadError={auditLogError}
          />
        );

      case "My Profile":
        return (
          <MyProfile
            account={account}
            onSave={saveAccountProfile}
          />
        );

      default:
        return <AccessDenied />;
    }
  };

  /* ============================================================
     LOADING
  ============================================================ */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
          <p className="text-sm text-slate-600">Loading PESO MABINI...</p>
        </div>
      </div>
    );
  }

  /* ============================================================
     MAIN LAYOUT
  ============================================================ */

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AdminSidebar
        activePage={activePage}
        setActivePage={setActivePage}
        permissions={permissions}
        hasUnreadMessages={hasUnreadMessages}
        isAdmin={
          account?.role ===
          "admin"
        }
      />

      <main className="min-h-screen lg:ml-56">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 pl-20 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 sm:px-6 sm:pl-20 sm:pt-[calc(env(safe-area-inset-top)+1rem)] sm:pb-4 lg:px-8">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-base font-bold leading-tight text-slate-900 sm:truncate sm:text-xl">
                {activePage}
              </h2>
              <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">
                Admin <span className="px-1 text-slate-300">/</span> {activePage}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              {account?.user_id && (
                <ProfileAvatar
                  key={account.user_id}
                  userId={account.user_id}
                  fullName={account.full_name}
                  size="small"
                  showControls={false}
                />
              )}
              <div className="min-w-0 max-w-[92px] text-right max-[360px]:hidden sm:max-w-none sm:text-left">
                <p className="break-words text-sm font-semibold text-slate-800 sm:truncate">
                  {account?.full_name}
                </p>
                <p className="text-[10px] leading-tight text-slate-500 sm:text-xs">
                  {account?.role === "admin" ? "Admin" : "PESO Staff"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-6 sm:pt-7 sm:pb-10 lg:px-8">
          {renderPage()}
        </section>
      </main>
    </div>
  );
}

/* ================================================================
   MY PROFILE
================================================================ */

function MyProfile({
  account,
  onSave,
}: {
  account: Account | null;
  onSave: (values: Pick<Account, "full_name" | "contact_no">) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    full_name: account?.full_name ?? "",
    contact_no: account?.contact_no ?? "",
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      setEditing(false);
    } catch (saveError) {
      console.error("Admin profile update error:", saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#123B70]">Profile</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your PESO Mabini account information.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setEditing(true);
            }}
            className="rounded-xl bg-[#0446A7] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#123B70]"
          >
            Edit Profile
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-5 border-b border-slate-100 bg-slate-50 px-6 py-6 sm:flex-row sm:items-center">
          {account?.user_id && (
            <ProfileAvatar
              userId={account.user_id}
              fullName={account.full_name}
              size="large"
              showControls={editing}
            />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#123B70]">
              {account?.full_name || "PESO User"}
              <span className="ml-2 inline-flex align-middle">
                <OfficialPESOBadge size="medium" />
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Official PESO account
              <span className="px-1.5" aria-hidden="true">·</span>
              {account?.role === "admin" ? "Admin" : "PESO Staff"}
            </p>
            <p className="mt-1 break-words text-sm text-slate-500">
              {account?.email || "Email not available"}
            </p>
          </div>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">
            Full Name
            <input
              value={editing ? form.full_name : account?.full_name ?? ""}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              required
              maxLength={120}
              disabled={!editing || saving}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-[#0446A7] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Email
            <input
              type="email"
              value={account?.email ?? ""}
              readOnly
              aria-describedby="admin-profile-email-note"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-500 outline-none disabled:bg-slate-50"
            />
            <span id="admin-profile-email-note" className="mt-1 block text-xs font-normal text-slate-400">
              Contact the super admin to change your sign-in email.
            </span>
          </label>

          {account?.role === "staff" && (
            <label className="block text-sm font-bold text-slate-700">
              Contact Number
              <input
                type="tel"
                value={editing ? form.contact_no : account.contact_no ?? ""}
                onChange={(event) => setForm({ ...form, contact_no: event.target.value })}
                maxLength={30}
                disabled={!editing || saving}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-[#0446A7] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          )}

          {editing && (
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5 sm:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setForm({
                    full_name: account?.full_name ?? "",
                    contact_no: account?.contact_no ?? "",
                  });
                  setError("");
                  setEditing(false);
                }}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#0446A7] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#123B70] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

/* ================================================================
   REUSABLE COMPONENTS
================================================================ */

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-bold text-blue-900">
        {value}
      </p>

    </div>
  );
}

function AnalyticsCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-5">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-blue-900">
        {value}
      </p>

    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">

      <span className="text-sm text-slate-600">
        {label}
      </span>

      <span className="font-bold text-slate-800">
        {value}
      </span>

    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let classes =
    "bg-slate-100 text-slate-600";

  if (
    normalized === "active" ||
    normalized === "approved" ||
    normalized === "hired"
  ) {
    classes =
      "bg-green-100 text-green-700";
  }

  if (
    normalized === "pending"
  ) {
    classes =
      "bg-yellow-100 text-yellow-700";
  }

  if (
    normalized === "inactive" ||
    normalized === "rejected" ||
    normalized === "closed"
  ) {
    classes =
      "bg-red-100 text-red-700";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}
    >
      {status}
    </span>
  );
}

function LoadingMessage() {
  return (
    <div className="p-10 text-center text-sm text-slate-500">
      Loading data...
    </div>
  );
}

function EmptyMessage({
  message,
}: {
  message: string;
}) {
  return (
    <div className="p-10 text-center">

      <p className="text-sm text-slate-500">
        {message}
      </p>

    </div>
  );
}

function formatDate(
  value?: string
) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function AccessDenied() {
  return (
    <div className="rounded-xl border border-red-200 bg-white p-10 text-center shadow-sm">

      <h3 className="text-xl font-bold text-red-600">
        Access Denied
      </h3>

      <p className="mt-2 text-sm text-slate-500">
        You do not have permission to access this module.
      </p>

    </div>
  );
}