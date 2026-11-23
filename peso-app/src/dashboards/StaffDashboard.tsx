import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import SidebarToggle from "../components/SidebarToggle";
import AppIcon, { type AppIconName } from "../components/AppIcon";
import ModuleIcon from "../components/ModuleIcon";
import ProfileAvatar from "../components/ProfileAvatar";
import { supabase } from "../services/supabase";
import AnalyticsModule from "../adminmodules/AnalyticsModule";
import { fetchAnalyticsData } from "../services/analyticsData";
import { openStoredResume } from "../services/resumes";
import ApplicationsModule from "../adminmodules/ApplicationsModule";
import type { ApplicationDecisionResult } from "../services/applicationDecisions";
import type {
  EmployerDocumentStatus,
  EmployerVerificationDocument,
} from "../services/employerRegistration";
import {
  parseStaffDashboardOverviewCounts,
} from "../services/adminDashboardData";
import MessagesModule from "../adminmodules/MessagesModule";
import PESOJobPostsModule from "../adminmodules/PESOJobPostsModule";
import PESOPosts from "../adminmodules/PESOPosts";
import { useUnreadMessages } from "../services/useUnreadMessages";
import { useConfirmation } from "../components/ConfirmationDialog";
import {
  getPasswordValidationError,
  PASSWORD_REQUIREMENTS_HELP_TEXT,
} from "../utils/passwordValidation";

type StaffPermission = {
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

type StaffAccount = {
  peso_staff_id: string;
  user_id: string;
  full_name: string;
  email: string;
  contact_no: string | null;
};

type ModuleName =
  | "Dashboard Overview"
  | "Analytics"
  | "Job Posts"
  | "Job Application"
  | "Employers"
  | "Job Seekers"
  | "Messages"
  | "PESO Posts";

type StaffRecordPage = "Employers" | "Job Seekers";
type StaffRecord = Record<string, unknown>;
type AnalyticsModuleProps = ComponentProps<typeof AnalyticsModule>;
type StaffAnalyticsData = Pick<
  AnalyticsModuleProps,
  "counts" | "applications" | "jobPosts" | "employers" | "jobSeekers"
>;

type StaffApplication = {
  application_id: string;
  employer_id: string;
  job_seeker_id: string;
  job_vacancy_id: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_contact_no: string | null;
  contact_number: string | null;
  applicant_address: string | null;
  resume_url: string | null;
  employer_name: string | null;
  position_title: string | null;
  status: string;
  archive_after?: string | null;
  archived_at?: string | null;
  date_applied: string;
  updated_at?: string;
  created_at?: string;
  job_location: string | null;
  job_requirements: string | null;
  is_peso_application: boolean;
  is_own_peso_application: boolean;
  can_update_status: boolean;
  [key: string]: any;
};

export default function StaffDashboard() {
  const confirm = useConfirmation();
  const [staff, setStaff] =
    useState<StaffAccount | null>(null);
  const hasUnreadMessages = useUnreadMessages(staff?.user_id);

  const [permissions, setPermissions] =
    useState<StaffPermission | null>(null);

  const [activePage, setActivePage] =
    useState<ModuleName | "My Profile">(
      "My Profile"
    );
  const initialModuleRedirectApplied = useRef(false);

  const [loading, setLoading] =
    useState(true);

  const [records, setRecords] = useState<StaffRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");

  // Off-canvas below `lg`: a permanent 288px column leaves no room for
  // content on a 320px phone.
  const [isSidebarOpen, setIsSidebarOpen] =
    useState(false);

  useEffect(() => {
    if (!isSidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () =>
      window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen]);

  const go = (page: ModuleName | "My Profile") => {
    setActivePage(page);
    setIsSidebarOpen(false);
  };

  const saveStaffProfile = async (
    values: Pick<StaffAccount, "full_name" | "contact_no"> & {
      password?: string;
    },
  ) => {
    if (!staff) throw new Error("Your staff profile is not loaded.");

    if (values.password) {
      const passwordError = getPasswordValidationError(values.password);
      if (passwordError) throw new Error(passwordError);

      const { error: passwordUpdateError } =
        await supabase.auth.updateUser({
          password: values.password,
        });
      if (passwordUpdateError) throw passwordUpdateError;
    }

    const { data, error } = await supabase
      .from("peso_staff")
      .update({
        full_name: values.full_name.trim(),
        contact_no: values.contact_no?.trim() || null,
      })
      .eq("peso_staff_id", staff.peso_staff_id)
      .select("full_name, contact_no")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your profile was not updated. Please sign in again and try once more.");
    setStaff({ ...staff, ...data });
  };

  const reviewStaffEmployerDocuments = async (
    employerId: string,
    documents: EmployerVerificationDocument[],
  ) => {
    const { data, error } = await supabase
      .from("employer")
      .update({ verification_documents: documents })
      .eq("employer_id", employerId)
      .select("employer_id, verification_documents")
      .maybeSingle();

    if (error) {
      console.error("Staff employer document review update failed:", error);
      throw new Error(`Document review status could not be saved: ${error.message}`);
    }
    if (!data) {
      throw new Error("Document review status was not saved because the employer record no longer exists.");
    }

    setRecords((current) =>
      current.map((record) =>
        record.employer_id === employerId
          ? { ...record, verification_documents: data.verification_documents }
          : record,
      ),
    );
  };

  /* =====================================================
     LOAD STAFF
  ===================================================== */

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    setLoading(true);

    try {
      /* ---------------------------------------------
         GET LOGGED-IN USER
      --------------------------------------------- */

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = "/login";
        return;
      }

      /* ---------------------------------------------
         FIND STAFF ACCOUNT
      --------------------------------------------- */

      const { data: staffData, error: staffError } =
        await supabase
          .from("peso_staff")
          .select(
            `
            peso_staff_id,
            user_id,
            full_name,
            email,
            contact_no
            `
          )
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

      if (staffError) {
        console.error(
          "Staff loading error:",
          staffError
        );

        return;
      }

      if (!staffData) {
        alert(
          "You are not registered as a PESO Staff."
        );

        window.location.href = "/login";
        return;
      }

      setStaff(staffData);

      /* ---------------------------------------------
         LOAD PERMISSIONS
      --------------------------------------------- */

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
          staffData.peso_staff_id
        )
        .maybeSingle();

      if (permissionError) {
        console.error(
          "Permission loading error:",
          permissionError
        );
      }

      setPermissions(
        permissionData || {
          dashboard_overview: false,
          analytics: false,
          job_posts: false,
          job_application: false,
          employers: false,
          job_seekers: false,
          messages: false,
          notifications: false,
          peso_posts: false,
        }
      );

    } catch (error) {
      console.error(error);

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activePage !== "Employers" && activePage !== "Job Seekers") {
      return;
    }

    let cancelled = false;

    const loadRecords = async () => {
      setRecordsLoading(true);
      setRecordsError("");
      setRecords([]);

      try {
        let rows: StaffRecord[] = [];

        if (activePage === "Employers") {
          const { data, error } = await supabase
            .from("employer")
            .select(
            "employer_id, name, contact_person, email, contact_no, address, is_verified, verification_status, created_at, registration_details, verification_documents",
            )
            .order("created_at", { ascending: false });

          if (error) throw error;
          rows = data ?? [];
        } else {
          const { data, error } = await supabase
            .from("job_seeker")
            .select(
              "job_seeker_id, full_name, email, contact_no, address, birth_date, resume_url, created_at",
            )
            .order("created_at", { ascending: false });

          if (error) throw error;
          rows = data ?? [];
        }

        if (!cancelled) setRecords(rows);
      } catch (error) {
        console.error(`${activePage} could not be loaded:`, error);
        if (!cancelled) {
          setRecordsError(
            error instanceof Error
              ? error.message
              : `Unable to load ${activePage.toLowerCase()}.`,
          );
        }
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [activePage]);

  /* =====================================================
     CHECK WHETHER MODULE IS ASSIGNED
  ===================================================== */

  const isAssigned = (
    module: ModuleName
  ): boolean => {

    if (!permissions) {
      return false;
    }

    switch (module) {

      case "Dashboard Overview":
        return permissions.dashboard_overview;

      case "Analytics":
        return permissions.analytics;

      case "Job Posts":
        return permissions.job_posts;

      case "Job Application":
        return permissions.job_application;

      case "Employers":
        return permissions.employers;

      case "Job Seekers":
        return permissions.job_seekers;

      case "Messages":
        return permissions.messages;

      case "PESO Posts":
        return permissions.peso_posts;

      default:
        return false;
    }
  };

  useEffect(() => {
    if (
      !staff ||
      !permissions ||
      initialModuleRedirectApplied.current
    ) {
      return;
    }

    const modulesInPermissionOrder: ModuleName[] = [
      "Dashboard Overview",
      "Analytics",
      "Job Posts",
      "Job Application",
      "Employers",
      "Job Seekers",
      "Messages",
      "PESO Posts",
    ];
    const firstPermittedModule = modulesInPermissionOrder.find(
      (module) => {
        switch (module) {
          case "Dashboard Overview":
            return permissions.dashboard_overview;
          case "Analytics":
            return permissions.analytics;
          case "Job Posts":
            return permissions.job_posts;
          case "Job Application":
            return permissions.job_application;
          case "Employers":
            return permissions.employers;
          case "Job Seekers":
            return permissions.job_seekers;
          case "Messages":
            return permissions.messages;
          case "PESO Posts":
            return permissions.peso_posts;
          default:
            return false;
        }
      },
    );

    initialModuleRedirectApplied.current = true;
    if (firstPermittedModule) {
      setActivePage(firstPermittedModule);
    }
  }, [staff, permissions]);

  /* =====================================================
     MODULE LIST
  ===================================================== */

  const modules: { name: ModuleName }[] = [
    { name: "Dashboard Overview" },
    { name: "Analytics" },
    { name: "Job Posts" },
    { name: "Job Application" },
    { name: "Employers" },
    { name: "Job Seekers" },
    { name: "Messages" },
    { name: "PESO Posts" },
  ];

  /* =====================================================
     LOGOUT
  ===================================================== */

  const handleLogout = async () => {
    if (!(await confirm("Are you sure you want to log out?"))) return;

    await supabase.auth.signOut();

    window.location.replace("/");
  };

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F8FC]">

        <div className="text-center">

          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-[#0446A7]" />

          <p className="font-semibold text-slate-500">
            Loading Staff Dashboard...
          </p>

        </div>

      </div>
    );
  }

  if (!staff) {
    return null;
  }

  /* =====================================================
     VISIBLE MODULES
  ===================================================== */

  const visibleModules =
    modules.filter((module) =>
      isAssigned(module.name)
    );

  /* =====================================================
     PAGE CONTENT
  ===================================================== */

  const renderContent = () => {
    if (
      activePage !== "My Profile" &&
      !isAssigned(activePage)
    ) {
      return (
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
          <h2 className="font-bold text-red-700">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            This module has not been assigned to your account.
          </p>
        </div>
      );
    }

    switch (activePage) {

      case "Dashboard Overview":
        return (
          <DashboardOverview
            permissions={
              permissions ?? {
                dashboard_overview: false,
                analytics: false,
                job_posts: false,
                job_application: false,
                employers: false,
                job_seekers: false,
                messages: false,
                notifications: false,
                peso_posts: false,
              }
            }
          />
        );

      case "Analytics":
        return <Analytics userId={staff.user_id} />;

      case "Job Posts":
        return <PESOJobPostsModule />;

      case "Job Application":
        return <JobApplications userId={staff?.user_id ?? null} />;

      case "Employers":
        return (
          <StaffRecordsModule
            page="Employers"
            records={records}
            loading={recordsLoading}
            error={recordsError}
            onReviewDocuments={reviewStaffEmployerDocuments}
          />
        );

      case "Job Seekers":
        return (
          <StaffRecordsModule
            page="Job Seekers"
            records={records}
            loading={recordsLoading}
            error={recordsError}
          />
        );

      case "Messages":
        return <MessagesModule mode="staff" />;

      case "PESO Posts":
        return <PESOPosts />;

      case "My Profile":
        return (
          <MyProfile staff={staff} onSave={saveStaffProfile} />
        );

      default:
        return (
          <MyProfile staff={staff} onSave={saveStaffProfile} />
        );
    }
  };

  /* =====================================================
     INTERFACE
  ===================================================== */

  return (
    <div className="min-h-screen bg-[#F5F8FC]">

      {/* =================================================
          SIDEBAR
      ================================================= */}

      {/* Tap-away backdrop, small screens only */}
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
        />
      )}

      <aside
        id="staff-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-72 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-[#0446A7] text-white transition-transform duration-300 ease-out motion-reduce:transition-none lg:translate-x-0 lg:overflow-hidden ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >

        {/* LOGO */}

        <div className="flex items-start justify-between gap-2 border-b border-blue-400/30 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-5 sm:px-6 sm:pb-6">

          <div className="min-w-0">
            <h1 className="text-xl font-black sm:text-2xl">
              PESO MABINI
            </h1>

            <p className="mt-1 text-sm text-blue-100">
              Staff Portal
            </p>
          </div>

          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsSidebarOpen(false)}
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-100 transition hover:bg-blue-600 lg:hidden"
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
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

        </div>

        {/* MENU */}

        <nav className="flex-1 overflow-y-auto px-4 py-6">

          <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-blue-200">
            Main Menu
          </p>

          <div className="space-y-1">

            {visibleModules.map(
              (module) => {

                const active =
                  activePage === module.name;

                return (
                  <button
                    key={module.name}
                    type="button"
                    onClick={() =>
                      go(module.name)
                    }
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? "bg-white text-[#0446A7] shadow-sm"
                        : "text-white hover:bg-blue-600"
                    }`}
                  >

                    <span className="flex w-6 justify-center" aria-hidden="true">
                      <ModuleIcon module={module.name} />
                    </span>

                    <span className="relative inline-flex">
                      {module.name}
                      {module.name === "Messages" && hasUnreadMessages && (
                        <span
                          aria-hidden="true"
                          className="absolute -right-2 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                        />
                      )}
                    </span>

                  </button>
                );
              }
            )}

          </div>

        </nav>

        {/* ACCOUNT ACTIONS */}

        <div className="mt-auto border-t border-blue-400/30 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">

          <button
            type="button"
            onClick={() => go("My Profile")}
            className={`mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
              activePage === "My Profile"
                ? "bg-white text-[#0446A7]"
                : "text-white hover:bg-blue-600"
            }`}
          >
            <span className="flex w-6 justify-center" aria-hidden="true">
              <ModuleIcon module="My Profile" />
            </span>
            <span>My Profile</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
          >

            <span className="flex w-6 justify-center">
              <AppIcon name="logOut" className="h-5 w-5" />
            </span>

            <span>
              Logout
            </span>

          </button>

        </div>

      </aside>

      <SidebarToggle
        open={isSidebarOpen}
        onClick={() =>
          setIsSidebarOpen((value) => !value)
        }
        label="Toggle staff navigation menu"
      />

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main className="min-h-screen lg:ml-72">

        {/* HEADER */}

        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 pl-20 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 sm:px-6 sm:pl-20 sm:pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:pb-5 lg:px-8">

          <div>

            <p className="text-sm font-semibold text-slate-400">
              PESO Staff
            </p>

            <h1 className="truncate text-xl font-black text-[#123B70] sm:text-2xl">
              {activePage}
            </h1>

          </div>

          <div className="flex items-center gap-3">

            <div className="hidden text-right sm:block">

              <p className="text-sm font-bold text-slate-800">
                {staff.full_name}
              </p>

              <p className="text-xs text-slate-500">
                PESO Staff
              </p>

            </div>

            <ProfileAvatar
              key={staff.user_id}
              userId={staff.user_id}
              fullName={staff.full_name}
              size="small"
              showControls={false}
            />

          </div>

        </header>

        {/* PAGE */}

        <div className="p-8">
          {renderContent()}
        </div>

      </main>

    </div>
  );
}


/* =========================================================
   DASHBOARD OVERVIEW
========================================================= */

function DashboardOverview({
  permissions,
}: {
  permissions: StaffPermission;
}) {

  const [counts, setCounts] = useState({
    jobs: null as number | null,
    applications: null as number | null,
    employers: null as number | null,
    seekers: null as number | null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCounts = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data, error } = await supabase.rpc(
          "get_staff_dashboard_overview_counts",
        );
        if (error) throw error;

        const result = parseStaffDashboardOverviewCounts(data);

        if (active) {
          setCounts({
            jobs: result.job_posts,
            applications: result.applications,
            employers: result.employers,
            seekers: result.job_seekers,
          });
        }
      } catch (error) {
        console.error("Staff dashboard counts could not be loaded:", error);
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : error &&
                  typeof error === "object" &&
                  "message" in error &&
                  typeof error.message === "string"
                ? error.message
                : "Unable to load dashboard counts.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadCounts();
    return () => {
      active = false;
    };
  }, []);

  const metrics = [
    permissions.job_posts
      ? { title: "Job Posts", value: counts.jobs, icon: "briefcase" as const }
      : null,
    permissions.job_application
      ? { title: "Applications", value: counts.applications, icon: "file" as const }
      : null,
    permissions.employers
      ? { title: "Employers", value: counts.employers, icon: "building" as const }
      : null,
    permissions.job_seekers
      ? { title: "Job Seekers", value: counts.seekers, icon: "users" as const }
      : null,
  ].filter((metric) => metric !== null);

  return (
    <div className="space-y-8">

      <div>

        <h2 className="text-2xl font-black text-[#123B70]">
          Dashboard Overview
        </h2>

        <p className="mt-1 text-slate-500">
          Overview of the PESO MABINI employment system.
        </p>

      </div>

      {loadError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          Dashboard counts could not be loaded: {loadError}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading dashboard counts...</p>
        ) : (
          metrics.map((metric) => (
            <StatCard
              key={metric.title}
              title={metric.title}
              value={metric.value ?? 0}
              icon={metric.icon}
            />
          ))
        )}
        {!loading && metrics.length === 0 && (
          <p className="text-sm text-slate-500">
            No dashboard statistics are assigned to your account.
          </p>
        )}
      </div>

    </div>
  );
}


/* =========================================================
   ANALYTICS
========================================================= */

function Analytics({ userId }: { userId: string }) {
  const [data, setData] = useState<StaffAnalyticsData>({
    counts: { jobs: 0, applications: 0, employers: 0, jobSeekers: 0 },
    applications: [],
    jobPosts: [],
    employers: [],
    jobSeekers: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);
  const requestVersion = useRef(0);

  const loadAnalyticsData = useCallback(async (showLoading = true) => {
    const currentRequest = ++requestVersion.current;
    if (showLoading) setLoading(true);
    setLoadError("");

    try {
      const analyticsData = await fetchAnalyticsData();
      if (currentRequest !== requestVersion.current) return;

      setData({
        counts: {
          jobs: analyticsData.jobPosts.length,
          applications: analyticsData.applications.length,
          employers: analyticsData.employers.length,
          jobSeekers: analyticsData.jobSeekers.length,
        },
        applications: analyticsData.applications as AnalyticsModuleProps["applications"],
        jobPosts: analyticsData.jobPosts as AnalyticsModuleProps["jobPosts"],
        employers: analyticsData.employers as AnalyticsModuleProps["employers"],
        jobSeekers: analyticsData.jobSeekers as AnalyticsModuleProps["jobSeekers"],
      });
    } catch (error) {
      if (currentRequest !== requestVersion.current) return;
      console.error("Staff analytics loading error:", error);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load analytics data.",
      );
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
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
      .channel(`staff-analytics-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_seeker" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "application" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employer" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_vacancy" },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          if (fallbackPoll) {
            clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
          setRealtimeUnavailable(false);
          void loadAnalyticsData(false);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error("Staff analytics realtime subscription failed:", {
            status,
            error: subscriptionError,
          });
          setRealtimeUnavailable(true);
          if (!fallbackPoll) {
            fallbackPoll = setInterval(() => {
              void loadAnalyticsData(false);
            }, 30000);
          }
        }
      });

    void loadAnalyticsData();
    return () => {
      active = false;
      requestVersion.current++;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackPoll) clearInterval(fallbackPoll);
      void supabase.removeChannel(channel);
    };
  }, [loadAnalyticsData, userId]);

  return (
    <AnalyticsModule
      {...data}
      loading={loading}
      loadError={loadError}
      realtimeUnavailable={realtimeUnavailable}
      StatCard={StaffAnalyticsStatCard}
      AnalyticsCard={StaffAnalyticsCard}
      SummaryRow={StaffAnalyticsSummaryRow}
    />
  );
}

function StaffAnalyticsStatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-blue-900">{value}</p>
    </div>
  );
}

function StaffAnalyticsCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-blue-900">{value}</p>
    </div>
  );
}

function StaffAnalyticsSummaryRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}


function StaffRecordsModule({
  page,
  records,
  loading,
  error,
  onReviewDocuments,
}: {
  page: StaffRecordPage;
  records: StaffRecord[];
  loading: boolean;
  error: string;
  onReviewDocuments?: (
    employerId: string,
    documents: EmployerVerificationDocument[],
  ) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [openingResumeId, setOpeningResumeId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const columns: {
    label: string;
    value: (record: StaffRecord) => string;
  }[] = page === "Employers"
    ? [
        { label: "Company / Employer", value: (record) => textValue(record.name) },
        { label: "Contact Person", value: (record) => textValue(record.contact_person) },
        { label: "Email", value: (record) => textValue(record.email) },
        { label: "Contact Number", value: (record) => textValue(record.contact_no) },
        { label: "Address", value: (record) => textValue(record.address) },
        {
          label: "Documents",
          value: (record) =>
            Array.isArray(record.verification_documents)
              ? `${record.verification_documents.length} uploaded`
              : "None uploaded",
        },
        {
          label: "Verification",
          value: (record) =>
            record.verification_status === "verified"
              ? "Verified"
              : record.verification_status === "not_approved"
                ? "Not approved"
                : record.is_verified === true
                  ? "Verified"
                  : "Pending",
        },
        { label: "Registered", value: (record) => dateValue(record.created_at) },
      ]
    : [
        { label: "Name", value: (record) => textValue(record.full_name) },
        { label: "Email", value: (record) => textValue(record.email) },
        { label: "Contact Number", value: (record) => textValue(record.contact_no) },
        { label: "Address", value: (record) => textValue(record.address) },
        { label: "Birth Date", value: (record) => dateValue(record.birth_date) },
        {
          label: "Resume",
          value: (record) => record.resume_url ? "Uploaded" : "Not uploaded",
        },
        { label: "Registered", value: (record) => dateValue(record.created_at) },
      ];

  const filteredRecords = records.filter((record) =>
    columns
      .map((column) => column.value(record))
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const handleOpenResume = async (record: StaffRecord, index: number) => {
    const resumePath = textValue(record.resume_url, "");
    if (!resumePath) return;

    const rowId = textValue(record.job_seeker_id, String(index));
    setOpeningResumeId(rowId);
    setResumeError("");

    try {
      await openStoredResume(resumePath);
    } catch (error) {
      console.error("Could not open job seeker resume:", error);
      setResumeError(
        error instanceof Error
          ? error.message
          : "Unable to open this resume. Please try again.",
      );
    } finally {
      setOpeningResumeId(null);
    }
  };

  const getRecordDocuments = (record: StaffRecord) => {
    if (!Array.isArray(record.verification_documents)) return [];
    return record.verification_documents.filter(
      (document): document is EmployerVerificationDocument =>
        Boolean(
          document &&
            typeof document === "object" &&
            typeof document.id === "string" &&
            typeof document.storage_path === "string" &&
            typeof document.file_name === "string" &&
            typeof document.status === "string",
        ),
    );
  };

  const handleOpenEmployerDocument = async (
    document: EmployerVerificationDocument,
  ) => {
    setDocumentError("");
    setOpeningDocumentId(document.id);
    const { data, error: signedUrlError } = await supabase.storage
      .from("employer-verification-documents")
      .createSignedUrl(document.storage_path, 60);
    setOpeningDocumentId(null);
    if (signedUrlError) {
      console.error("Could not open employer registration document:", signedUrlError);
      setDocumentError(signedUrlError.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleReviewEmployerDocument = async (
    record: StaffRecord,
    documentId: string,
    status: EmployerDocumentStatus,
  ) => {
    const employerId = textValue(record.employer_id, "");
    if (!employerId || !onReviewDocuments) return;
    const documents = getRecordDocuments(record).map((document) =>
      document.id === documentId
        ? { ...document, status, reviewed_at: new Date().toISOString() }
        : document,
    );
    setDocumentError("");
    try {
      await onReviewDocuments(employerId, documents);
    } catch (reviewError) {
      setDocumentError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to update document review status.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h2 className="text-2xl font-black text-[#123B70]">{page}</h2>
          <p className="mt-2 text-slate-500">
            View complete {page.toLowerCase()} information.
          </p>
        </div>
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Search ${page.toLowerCase()}...`}
        aria-label={`Search ${page.toLowerCase()}`}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500"
      />

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load {page.toLowerCase()}: {error}
        </p>
      )}
      {resumeError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {resumeError}
        </p>
      )}
      {documentError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {documentError}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading records...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {error ? "Records are unavailable until the load issue is fixed." : `No ${page.toLowerCase()} found.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.label} className="px-4 py-3 font-bold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record, index) => (
                  <tr
                    key={textValue(
                      record.job_vacancy_id ||
                        record.employer_id ||
                        record.job_seeker_id,
                      String(index),
                    )}
                    className="align-top hover:bg-slate-50"
                  >
                    {columns.map((column, columnIndex) => (
                      <td
                        key={column.label}
                        className={`max-w-sm px-4 py-3 text-slate-700 ${
                          columnIndex === 0 ? "font-semibold text-slate-900" : ""
                        } ${column.label === "Description" || column.label === "Requirements" ? "whitespace-normal" : "whitespace-nowrap"}`}
                      >
                        {page === "Job Seekers" && column.label === "Resume" ? (
                          record.resume_url ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenResume(record, index)}
                              disabled={
                                openingResumeId ===
                                textValue(record.job_seeker_id, String(index))
                              }
                              className="rounded-full border border-[#203F8B] px-3 py-1.5 text-xs font-semibold text-[#203F8B] hover:bg-blue-50 disabled:opacity-60"
                            >
                              {openingResumeId ===
                              textValue(record.job_seeker_id, String(index))
                                ? "Opening..."
                                : "View Resume"}
                            </button>
                          ) : (
                            "Not uploaded"
                          )
                        ) : (
                          page === "Employers" && column.label === "Documents" ? (
                            <div className="min-w-[16rem] space-y-2 whitespace-normal">
                              {getRecordDocuments(record).length === 0 ? (
                                <span className="text-xs text-slate-500">None uploaded</span>
                              ) : (
                                getRecordDocuments(record).map((document) => (
                                  <div key={document.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleOpenEmployerDocument(document)}
                                      disabled={openingDocumentId === document.id}
                                      className="max-w-40 truncate text-left text-xs font-semibold text-blue-700 hover:underline"
                                    >
                                      {openingDocumentId === document.id ? "Preparing link..." : document.file_name}
                                    </button>
                                    <select
                                      aria-label={`Review status for ${document.file_name}`}
                                      value={document.status}
                                      onChange={(event) => {
                                        const status = event.target.value;
                                        if (status === "pending" || status === "approved" || status === "rejected") {
                                          void handleReviewEmployerDocument(record, document.id, status);
                                        }
                                      }}
                                      className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="approved">Approved</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
                                  </div>
                                ))
                              )}
                            </div>
                          ) : (
                            column.value(record)
                          )
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function textValue(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function dateValue(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}


/* =========================================================
   JOB APPLICATIONS
========================================================= */

function JobApplications({ userId }: { userId: string | null }) {
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    const loadApplications = async () => {
      setLoading(true);
      setLoadError("");
      const [
        applicationsResult,
        seekersResult,
        employersResult,
        jobsResult,
      ] = await Promise.all([
        supabase.from("application").select("*"),
        supabase
          .from("job_seeker")
          .select(
            "job_seeker_id, full_name, email, contact_no, address, resume_url",
          ),
        supabase.from("employer").select("employer_id, name, is_peso"),
        supabase
          .from("job_vacancy")
          .select(
            "job_vacancy_id, employer_id, position_title, posted_by_user_id, requirements, location",
          ),
      ]);

      if (!active) return;
      if (applicationsResult.error) {
        console.error("Staff application loading error:", applicationsResult.error);
        setLoadError(
          `Unable to load applications: ${applicationsResult.error.message}`,
        );
        setApplications([]);
      } else {
        const seekersById = new Map(
          (seekersResult.data ?? []).map((seeker) => [
            seeker.job_seeker_id,
            seeker,
          ]),
        );
        const employers = new Map(
          (employersResult.data ?? []).map((employer) => [
            employer.employer_id,
            employer,
          ]),
        );
        const jobs = jobsResult.data ?? [];
        const supportingErrors: string[] = [];

        if (seekersResult.error) {
          console.error("Staff application seeker loading error:", seekersResult.error);
          supportingErrors.push(
            `Applicant details could not be loaded: ${seekersResult.error.message}`,
          );
        }
        if (employersResult.error) {
          console.error("Staff application employer loading error:", employersResult.error);
          supportingErrors.push(
            `Employer details could not be loaded: ${employersResult.error.message}`,
          );
        }
        if (jobsResult.error) {
          console.error("Staff application job loading error:", jobsResult.error);
          supportingErrors.push(
            `Job details could not be loaded: ${jobsResult.error.message}`,
          );
        }

        setLoadError(supportingErrors.join(" "));
        setApplications(
          (applicationsResult.data ?? []).map((application) => {
            const seeker = seekersById.get(application.job_seeker_id);
            const employer = employers.get(application.employer_id);
            const job = jobs.find((candidate) =>
              application.job_vacancy_id
                ? candidate.job_vacancy_id === application.job_vacancy_id
                : candidate.employer_id === application.employer_id &&
                  candidate.position_title === application.position_title,
            );
            const isPesoApplication = employer?.is_peso === true;
            const isOwnPesoApplication =
              isPesoApplication && job?.posted_by_user_id === userId;

            return {
              ...application,
              applicant_name:
                application.applicant_name ?? seeker?.full_name ?? null,
              applicant_email:
                application.applicant_email ?? seeker?.email ?? null,
              applicant_contact_no:
                application.applicant_contact_no ?? seeker?.contact_no ?? null,
              contact_number:
                application.applicant_contact_no ?? seeker?.contact_no ?? null,
              applicant_address:
                application.applicant_address ?? seeker?.address ?? null,
              resume_url:
                application.applicant_resume_url ?? seeker?.resume_url ?? null,
              employer_name: employer?.name ?? null,
              job_location: job?.location ?? null,
              job_requirements: job?.requirements ?? null,
              is_peso_application: isPesoApplication,
              is_own_peso_application: isOwnPesoApplication,
              can_update_status:
                !employersResult.error &&
                !jobsResult.error &&
                isOwnPesoApplication,
            };
          }),
        );
      }
      setLoading(false);
    };

    void loadApplications();
    const channel = supabase
      .channel("staff-application-archive")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "application",
        },
        (payload) => {
          const updatedApplication =
            payload.new as Partial<StaffApplication>;
          if (!updatedApplication.application_id) return;

          setApplications((current) =>
            current.map((application) =>
              application.application_id ===
              updatedApplication.application_id
                ? {
                    ...application,
                    archive_after: updatedApplication.archive_after,
                    archived_at: updatedApplication.archived_at,
                  }
                : application,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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
      console.error("Staff application status update error:", error);
      throw new Error(`Application status could not be updated: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        "Application status was not updated. The record may no longer exist or you may not be assigned to manage applications.",
      );
    }

    setApplications((current) =>
      current.map((application) =>
        application.application_id === applicationId
          ? { ...application, status }
          : application,
      ),
    );
  };

  const unsupportedDecision = async (): Promise<ApplicationDecisionResult> => {
    throw new Error("Application decisions are unavailable to staff.");
  };

  return (
    <ApplicationsModule
      applications={applications}
      loadError={loadError}
      search={search}
      setSearch={setSearch}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      loading={loading}
      canDecideApplications={false}
      onUpdateStatus={updateApplicationStatus}
      onDecideApplication={unsupportedDecision}
      LoadingMessage={() => (
        <p className="p-6 text-sm text-slate-500">Loading applications...</p>
      )}
      EmptyMessage={({ message }) => (
        <p className="p-6 text-sm text-slate-500">{message}</p>
      )}
      formatDate={(value) => dateValue(value)}
    />
  );
}


/* =========================================================
   MY PROFILE
========================================================= */

function MyProfile({
  staff,
  onSave,
}: {
  staff: StaffAccount;
  onSave: (
    values: Pick<StaffAccount, "full_name" | "contact_no"> & {
      password?: string;
    },
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    full_name: staff.full_name,
    contact_no: staff.contact_no ?? "",
    new_password: "",
    confirm_password: "",
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.new_password || form.confirm_password) {
      if (form.new_password !== form.confirm_password) {
        setError("Passwords do not match.");
        return;
      }
      const passwordError = getPasswordValidationError(form.new_password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        full_name: form.full_name,
        contact_no: form.contact_no,
        password: form.new_password || undefined,
      });
      setForm((current) => ({
        ...current,
        new_password: "",
        confirm_password: "",
      }));
      setEditing(false);
    } catch (saveError) {
      console.error("Staff profile update error:", saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#123B70]">My Profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your PESO MABINI staff account information.
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
          <ProfileAvatar
            userId={staff.user_id}
            fullName={staff.full_name}
            size="large"
            showControls={editing}
          />
          <div className="min-w-0">
            <h3 className="text-lg font-black text-[#123B70]">
              {staff.full_name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">PESO Staff</p>
            <p className="mt-1 break-words text-sm text-slate-500">
              {staff.email}
            </p>
          </div>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">
            Full Name
            <input
              value={editing ? form.full_name : staff.full_name}
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
              value={staff.email}
              readOnly
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-500"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Contact Number
            <input
              type="tel"
              value={editing ? form.contact_no : staff.contact_no ?? ""}
              onChange={(event) => setForm({ ...form, contact_no: event.target.value })}
              maxLength={30}
              disabled={!editing || saving}
              placeholder="Not provided"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-[#0446A7] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Role
            <input
              value="PESO Staff"
              disabled
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-500"
            />
          </label>

          {editing && (
            <>
              <label className="block text-sm font-bold text-slate-700">
                New Password
                <input
                  type="password"
                  value={form.new_password}
                  onChange={(event) =>
                    setForm({ ...form, new_password: event.target.value })
                  }
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current password"
                  disabled={saving}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-[#0446A7] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Confirm New Password
                <input
                  type="password"
                  value={form.confirm_password}
                  onChange={(event) =>
                    setForm({ ...form, confirm_password: event.target.value })
                  }
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  disabled={saving}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-[#0446A7] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
              </label>

              <p className="text-xs text-slate-500 sm:col-span-2">
                {PASSWORD_REQUIREMENTS_HELP_TEXT}
              </p>
            </>
          )}

          {editing && (
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5 sm:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setForm({
                    full_name: staff.full_name,
                    contact_no: staff.contact_no ?? "",
                    new_password: "",
                    confirm_password: "",
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


/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: AppIconName;
}) {

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="flex items-start justify-between">

        <div>

          <p className="text-sm font-semibold text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-3xl font-black text-[#123B70]">
            {value}
          </p>

        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-xl text-[#0446A7]">
          <AppIcon name={icon} className="h-6 w-6" />
        </div>

      </div>

    </div>
  );
}