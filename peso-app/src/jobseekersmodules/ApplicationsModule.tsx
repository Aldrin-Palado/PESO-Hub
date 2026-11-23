import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../services/supabase";
import {
  getResumeExtension,
  getResumeFileName,
  openStoredResume,
  RESUME_ACCEPT,
  RESUME_BUCKET,
  RESUME_FORMATS_LABEL,
  RESUME_MIME_TYPES,
  openLocalResumeFile,
} from "../services/resumes";
import ApplicationArchiveTabs from "../components/ApplicationArchiveTabs";
import {
  isApplicationArchived,
  type ApplicationArchiveSection,
} from "../utils/applicationArchive";
import { getApplicationStatusStyles } from "../utils/applicationStatusStyles";
import { getEmployerProfileLogo } from "../utils/employerProfileLogo";

type Seeker = {
  job_seeker_id: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  contact_no?: string | null;
  address?: string | null;
  resume_url?: string | null;
};

type JobSeekerPage =
  | "Home"
  | "Jobs"
  | "Applications"
  | "Messages"
  | "Profile";

type ApplicationDocument = {
  name: string;
  path: string;
};

type ApplicationEmployerProfile = {
  application_id: string;
  employer_name: string | null;
  employer_logo_url: string | null;
  employer_is_peso: boolean;
};

type Application = {
  id: string;
  job: string;
  company: string;
  companyLogoUrl: string | null;
  date: string;
  status: string;
  archive_after: string | null;
  archived_at: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
  contactNumber: string | null;
  address: string | null;
  resumeUrl: string | null;
  qualificationFiles: ApplicationDocument[];
};

type ApplicationEditValues = {
  fullName: string;
  email: string;
  contactNumber: string;
  address: string;
};

type Props = {
  seeker: Seeker;
  onNavigate: (page: JobSeekerPage) => void;
};

function canEditApplication(application: Application) {
  const status = application.status
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    ["pending", "under_review", "shortlisted"].includes(status) &&
    !isApplicationArchived(application)
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalizedStatus = status.toLowerCase();
  const styles = getApplicationStatusStyles(normalizedStatus);

  const label =
    normalizedStatus === "hired"
      ? "You're Hired"
      : normalizedStatus === "interviewed"
        ? "Interviewed"
        : normalizedStatus.replace(/_/g, " ");

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles}`}
    >
      {label}
    </span>
  );
}

export default function ApplicationsModule({
  seeker,
  onNavigate,
}: Props) {
  const [filter, setFilter] = useState("All");
  const [applicationSection, setApplicationSection] =
    useState<ApplicationArchiveSection>("active");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
  const [openingResume, setOpeningResume] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [editingApplication, setEditingApplication] = useState(false);
  const [editValues, setEditValues] = useState<ApplicationEditValues | null>(null);
  const [editResumeFile, setEditResumeFile] = useState<File | null>(null);
  const editResumeInputRef = useRef<HTMLInputElement>(null);
  const [editQualificationFiles, setEditQualificationFiles] = useState<File[]>([]);
  const [keptQualificationFiles, setKeptQualificationFiles] = useState<
    ApplicationDocument[]
  >([]);
  const [savingApplication, setSavingApplication] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    let active = true;

    const loadApplications = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("application")
        .select(`
          application_id,
          position_title,
          status,
          archive_after,
          archived_at,
          date_applied,
          applicant_name,
          applicant_email,
          applicant_contact_no,
          applicant_address,
          applicant_resume_url,
          applicant_qualification_files
        `)
        .eq("job_seeker_id", seeker.job_seeker_id)
        .order("date_applied", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Error loading job seeker applications:", error);
        setLoadError(`Unable to load applications: ${error.message}`);
        setApplications([]);
        if (showLoading) setLoading(false);
        return;
      }

      const { data: employerProfileData, error: employerProfilesError } =
        await supabase.rpc("get_my_application_employer_profiles");

      if (!active) return;

      if (employerProfilesError) {
        console.error(
          "Error loading employer profiles for applications:",
          employerProfilesError,
        );
        setLoadError(
          `Unable to load employer profiles: ${employerProfilesError.message}`,
        );
        setApplications([]);
        if (showLoading) setLoading(false);
        return;
      }

      const employerProfiles =
        employerProfileData as ApplicationEmployerProfile[] | null;
      const employerProfilesByApplicationId = new Map<
        string,
        ApplicationEmployerProfile
      >();
      for (const profile of employerProfiles ?? []) {
        employerProfilesByApplicationId.set(profile.application_id, profile);
      }

      setApplications(
        (data ?? []).map((row) => {
          const employerProfile = employerProfilesByApplicationId.get(
            row.application_id,
          );

          return {
            id: row.application_id,
            job: row.position_title || "Position not specified",
            company: employerProfile?.employer_name || "Employer",
            companyLogoUrl: getEmployerProfileLogo(
              employerProfile?.employer_logo_url,
              employerProfile?.employer_is_peso,
            ),
            date: new Date(row.date_applied).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
            status: row.status,
            archive_after: row.archive_after,
            archived_at: row.archived_at,
            applicantName: row.applicant_name,
            applicantEmail: row.applicant_email,
            contactNumber: row.applicant_contact_no,
            address: row.applicant_address,
            resumeUrl: row.applicant_resume_url,
            qualificationFiles: Array.isArray(row.applicant_qualification_files)
              ? row.applicant_qualification_files.filter(
                  (document): document is ApplicationDocument =>
                    typeof document === "object" &&
                    document !== null &&
                    "name" in document &&
                    typeof document.name === "string" &&
                    "path" in document &&
                    typeof document.path === "string",
                )
              : [],
          };
        })
      );
      if (showLoading) setLoading(false);
    };

    void loadApplications();
    const channel = supabase
      .channel(`job-seeker-applications-${seeker.job_seeker_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "application",
          filter: `job_seeker_id=eq.${seeker.job_seeker_id}`,
        },
        () => void loadApplications(false),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [seeker.job_seeker_id]);

  const handleOpenResume = async () => {
    if (!selectedApplication?.resumeUrl || openingResume) return;

    setOpeningResume(true);
    setResumeError("");
    try {
      await openStoredResume(selectedApplication.resumeUrl);
    } catch (error) {
      console.error("Could not open application resume:", error);
      setResumeError(
        error instanceof Error ? error.message : "Unable to open the uploaded resume.",
      );
    } finally {
      setOpeningResume(false);
    }
  };

  const handleOpenQualificationFile = async (document: ApplicationDocument) => {
    if (openingResume) return;

    setOpeningResume(true);
    setResumeError("");
    try {
      await openStoredResume(document.path);
    } catch (error) {
      console.error("Could not open application document:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to open the uploaded document.";
      if (editingApplication) setEditError(message);
      else setResumeError(message);
    } finally {
      setOpeningResume(false);
    }
  };

  const handleOpenLocalQualificationFile = (file: File) => {
    try {
      openLocalResumeFile(file);
    } catch (error) {
      console.error("Could not preview selected qualification document:", error);
      setEditError(
        error instanceof Error
          ? error.message
          : "Unable to preview the selected document.",
      );
    }
  };

  const startEditingApplication = (application: Application) => {
    if (!canEditApplication(application)) return;

    setSelectedApplication(application);
    setEditValues({
      fullName: application.applicantName || seeker.full_name || "",
      email: application.applicantEmail || seeker.email || "",
      contactNumber: application.contactNumber || seeker.contact_no || "",
      address: application.address || seeker.address || "",
    });
    setEditResumeFile(null);
    setEditQualificationFiles([]);
    setKeptQualificationFiles([...application.qualificationFiles]);
    setEditError("");
    setResumeError("");
    setEditingApplication(true);
  };

  const cancelEditingApplication = () => {
    setSelectedApplication(null);
    setEditingApplication(false);
    setEditValues(null);
    setEditResumeFile(null);
    setEditQualificationFiles([]);
    setKeptQualificationFiles([]);
    setEditError("");
    setResumeError("");
  };

  const saveApplicationChanges = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedApplication || !editValues || savingApplication) return;

    if (!canEditApplication(selectedApplication)) {
      setEditError("This application can no longer be edited because its status has changed.");
      return;
    }

    if (
      !editValues.fullName.trim() ||
      !editValues.email.trim() ||
      !editValues.contactNumber.trim() ||
      !editValues.address.trim()
    ) {
      setEditError("Please complete all contact details before saving.");
      return;
    }

    if (editResumeFile) {
      const extension = getResumeExtension(editResumeFile.name);
      if (!RESUME_MIME_TYPES[extension]) {
        setEditError(`Please choose a ${RESUME_FORMATS_LABEL} resume file.`);
        return;
      }
      if (editResumeFile.size > 5 * 1024 * 1024) {
        setEditError("Resume must not exceed 5 MB.");
        return;
      }
    }

    if (keptQualificationFiles.length + editQualificationFiles.length > 10) {
      setEditError("You can attach up to 10 supporting documents.");
      return;
    }

    const invalidQualificationFile = editQualificationFiles.find((file) => {
      const extension = getResumeExtension(file.name);
      return !RESUME_MIME_TYPES[extension] || file.size > 5 * 1024 * 1024;
    });
    if (invalidQualificationFile) {
      setEditError(
        `${invalidQualificationFile.name} must be a ${RESUME_FORMATS_LABEL} file up to 5 MB.`,
      );
      return;
    }

    setSavingApplication(true);
    setEditError("");
    const uploadedPaths: string[] = [];

    try {
      let resumeUrl = selectedApplication.resumeUrl;
      if (editResumeFile) {
        const extension = getResumeExtension(editResumeFile.name);
        const safeFileName = editResumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const resumePath =
          `${seeker.user_id}/applications/${selectedApplication.id}/` +
          `${Date.now()}-resume-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(resumePath, editResumeFile, {
            upsert: false,
            contentType: RESUME_MIME_TYPES[extension],
          });
        if (uploadError) {
          throw new Error(`Unable to upload your resume: ${uploadError.message}`);
        }
        uploadedPaths.push(resumePath);
        resumeUrl = resumePath;
      }

      const addedQualificationFiles: ApplicationDocument[] = [];
      for (const [index, file] of editQualificationFiles.entries()) {
        const extension = getResumeExtension(file.name);
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const documentPath =
          `${seeker.user_id}/applications/${selectedApplication.id}/` +
          `${Date.now()}-${index}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(documentPath, file, {
            upsert: false,
            contentType: RESUME_MIME_TYPES[extension],
          });
        if (uploadError) {
          throw new Error(`Unable to upload ${file.name}: ${uploadError.message}`);
        }
        uploadedPaths.push(documentPath);
        addedQualificationFiles.push({ name: file.name, path: documentPath });
      }

      const qualificationFiles = [
        ...keptQualificationFiles,
        ...addedQualificationFiles,
      ];
      const { data, error: updateError } = await supabase
        .from("application")
        .update({
          applicant_name: editValues.fullName.trim(),
          applicant_email: editValues.email.trim(),
          applicant_contact_no: editValues.contactNumber.trim(),
          applicant_address: editValues.address.trim(),
          applicant_resume_url: resumeUrl,
          applicant_qualification_files: qualificationFiles,
        })
        .eq("application_id", selectedApplication.id)
        .select("application_id")
        .maybeSingle();

      if (updateError) {
        throw new Error(`Unable to update your application: ${updateError.message}`);
      }
      if (!data) {
        throw new Error(
          "Your application was not updated. Its status may have changed, or it may no longer be editable.",
        );
      }

      uploadedPaths.length = 0;
      const updatedApplication: Application = {
        ...selectedApplication,
        applicantName: editValues.fullName.trim(),
        applicantEmail: editValues.email.trim(),
        contactNumber: editValues.contactNumber.trim(),
        address: editValues.address.trim(),
        resumeUrl,
        qualificationFiles,
      };
      setApplications((current) =>
        current.map((application) =>
          application.id === updatedApplication.id
            ? updatedApplication
            : application,
        ),
      );
      setSelectedApplication(updatedApplication);
      setEditingApplication(false);
      setEditValues(null);
      setEditResumeFile(null);
      setEditQualificationFiles([]);
      setKeptQualificationFiles([]);

      const removedQualificationPaths = selectedApplication.qualificationFiles
        .filter(
          (document) =>
            !keptQualificationFiles.some(
              (keptDocument) => keptDocument.path === document.path,
            ),
        )
        .map((document) => document.path);
      if (removedQualificationPaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(RESUME_BUCKET)
          .remove(removedQualificationPaths);
        if (removeError) {
          console.error("Could not remove deleted application documents:", removeError);
          setEditError(
            "Application updated, but removed supporting documents could not be deleted.",
          );
        }
      }
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Unable to update your application.";
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage
          .from(RESUME_BUCKET)
          .remove(uploadedPaths);
        if (cleanupError) {
          console.error("Could not remove unlinked application documents:", cleanupError);
          message += " Some uploaded files may need to be removed manually.";
        }
      }
      console.error("Error updating job application:", error);
      setEditError(message);
    } finally {
      setSavingApplication(false);
    }
  };

  const closeSelectedApplication = () => {
    if (openingResume || savingApplication) return;
    setSelectedApplication(null);
    setEditingApplication(false);
    setEditValues(null);
    setEditResumeFile(null);
    setEditQualificationFiles([]);
    setKeptQualificationFiles([]);
    setEditError("");
    setResumeError("");
  };

  const filtered = useMemo(
    () =>
      applications.filter((application) =>
        isApplicationArchived(application) ===
          (applicationSection === "archived") &&
        (
          filter === "All" ||
          application.status.toLowerCase() === filter.toLowerCase()
        )
      ),
    [applications, applicationSection, filter]
  );
  const activeCount = applications.filter(
    (application) => !isApplicationArchived(application),
  ).length;
  const archivedCount = applications.length - activeCount;

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          My Applications
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Track the status of your job applications.
        </p>

        {seeker.full_name && (
          <p className="mt-2 text-sm text-blue-700">
            Applications of {seeker.full_name}
          </p>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          "All",
          "pending",
          "under_review",
          "shortlisted",
          "qualified",
          "interviewed",
          "hired",
          "rejected",
          "withdrawn",
        ].map((item) => (          <button            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === item
                ? "bg-blue-700 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-blue-50"
            }`}
          >
            {item === "All"
              ? item
                : item
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Applications */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <h2 className="text-sm font-bold text-gray-700">Applications</h2>
            <span className="text-xs text-gray-400">
              {filtered.length} record{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="w-full sm:max-w-xs">
            <ApplicationArchiveTabs
              value={applicationSection}
              onChange={setApplicationSection}
              activeCount={activeCount}
              archivedCount={archivedCount}
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm text-sm text-gray-500">
            Loading your applications...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
          >
            {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-2xl">
              <AppIcon name="file" className="h-7 w-7 text-blue-700" />
            </div>

            <h3 className="mt-4 font-semibold text-gray-900">
              No applications found
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              There are no applications under the selected status.
            </p>

            <button
              type="button"
              onClick={() => onNavigate("Jobs")}
              className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Explore Jobs
            </button>

          </div>
        ) : (
          filtered.map((application) => (
            <div
              key={application.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">

                {/* Company Icon */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-100 font-bold text-blue-700">
                  {application.companyLogoUrl ? (
                    <img
                      src={application.companyLogoUrl}
                      alt={`${application.company} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    application.company.charAt(0)
                  )}
                </div>

                {/* Application Information */}
                <div className="flex-1">

                  <h3 className="font-bold text-gray-900">
                    {application.job}
                  </h3>

                  <p className="text-sm font-medium text-blue-700">
                    {application.company}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">

                    <span>
                      Applied: {application.date}
                    </span>

                  </div>

                </div>

                {/* Status + View */}
                <div className="flex flex-wrap items-center gap-3">

                  <StatusBadge
                    status={application.status}
                  />

                  {canEditApplication(application) && (
                    <button
                      type="button"
                      onClick={() => startEditingApplication(application)}
                      className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                    >
                      Edit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setResumeError("");
                      setEditingApplication(false);
                      setSelectedApplication(application);
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                  >
                    View
                  </button>

                </div>

              </div>
            </div>
          ))
        )}

      </div>

      {selectedApplication && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !openingResume &&
              !savingApplication
            ) {
              closeSelectedApplication();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-seeker-application-details-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="job-seeker-application-details-title"
                  className="text-lg font-bold text-gray-900"
                >
                  {editingApplication ? "Edit application" : "Application details"}
                </h2>
                <p className="mt-1 text-sm text-blue-700">
                  {selectedApplication.job}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSelectedApplication}
                disabled={openingResume || savingApplication}
                aria-label="Close application"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                ×
              </button>
            </header>

            {editError && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {editError}
              </p>
            )}

            {editingApplication && editValues ? (
              <form onSubmit={saveApplicationChanges} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Full name
                  </span>
                  <input
                    required
                    value={editValues.fullName}
                    onChange={(event) =>
                      setEditValues((current) =>
                        current ? { ...current, fullName: event.target.value } : current,
                      )
                    }
                    disabled={savingApplication}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    value={editValues.email}
                    onChange={(event) =>
                      setEditValues((current) =>
                        current ? { ...current, email: event.target.value } : current,
                      )
                    }
                    disabled={savingApplication}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Contact number
                  </span>
                  <input
                    required
                    type="tel"
                    value={editValues.contactNumber}
                    onChange={(event) =>
                      setEditValues((current) =>
                        current
                          ? { ...current, contactNumber: event.target.value }
                          : current,
                      )
                    }
                    disabled={savingApplication}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Address
                  </span>
                  <textarea
                    required
                    rows={3}
                    value={editValues.address}
                    onChange={(event) =>
                      setEditValues((current) =>
                        current ? { ...current, address: event.target.value } : current,
                      )
                    }
                    disabled={savingApplication}
                    className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>

                <div>
                  <p className="mb-1.5 text-sm font-semibold text-gray-700">
                    Resume
                  </p>
                  <div className="rounded-xl border border-slate-300 p-3">
                    {editResumeFile ? (
                      <p className="break-all text-sm font-semibold text-slate-800">
                        {editResumeFile.name}
                      </p>
                    ) : selectedApplication.resumeUrl ? (
                      <button
                        type="button"
                        onClick={() => void handleOpenResume()}
                        disabled={openingResume || savingApplication}
                        className="break-all text-left text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 disabled:opacity-60"
                      >
                        {openingResume
                          ? "Opening resume..."
                          : getResumeFileName(selectedApplication.resumeUrl)}
                      </button>
                    ) : (
                      <p className="text-sm font-semibold text-slate-800">
                        No resume attached
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {editResumeFile
                        ? "Selected as the resume for this application."
                        : selectedApplication.resumeUrl
                          ? "This resume is currently attached to the application."
                          : `Choose a ${RESUME_FORMATS_LABEL} file up to 5 MB.`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editResumeFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditResumeFile(null);
                            if (editResumeInputRef.current) {
                              editResumeInputRef.current.value = "";
                            }
                          }}
                          disabled={savingApplication}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {selectedApplication.resumeUrl
                            ? "Keep current resume"
                            : "Clear selection"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => editResumeInputRef.current?.click()}
                        disabled={savingApplication}
                        className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      >
                        {editResumeFile
                          ? "Choose a different file"
                          : selectedApplication.resumeUrl
                            ? "Replace resume"
                            : "Choose resume"}
                      </button>
                    </div>
                    <input
                      ref={editResumeInputRef}
                      type="file"
                      accept={RESUME_ACCEPT}
                      aria-label="Choose a replacement resume"
                      disabled={savingApplication}
                      onChange={(event) =>
                        setEditResumeFile(event.target.files?.[0] ?? null)
                      }
                      className="sr-only"
                    />
                  </div>
                  {resumeError && (
                    <p role="alert" className="mt-2 text-xs text-red-700">
                      {resumeError}
                    </p>
                  )}
                </div>

                <section>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Qualifications and requirements documents
                  </h3>
                  {keptQualificationFiles.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {keptQualificationFiles.map((document) => (
                        <li
                          key={document.path}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <button
                            type="button"
                            onClick={() => void handleOpenQualificationFile(document)}
                            disabled={openingResume || savingApplication}
                            className="min-w-0 truncate text-left text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 disabled:opacity-60"
                          >
                            {document.name}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setKeptQualificationFiles((current) =>
                                current.filter((item) => item.path !== document.path),
                              )
                            }
                            disabled={savingApplication}
                            className="shrink-0 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      No supporting documents are attached.
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-300 p-3">
                    <span className="min-w-0 truncate text-sm text-slate-600">
                      {editQualificationFiles.length > 0
                        ? `${editQualificationFiles.length} new file${editQualificationFiles.length === 1 ? "" : "s"} selected`
                        : "No new files selected"}
                    </span>
                    <label
                      className={`relative inline-flex shrink-0 items-center overflow-hidden rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 ${
                        savingApplication ||
                        keptQualificationFiles.length + editQualificationFiles.length >= 10
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-blue-100"
                      }`}
                    >
                      Choose files
                      <input
                        type="file"
                        multiple
                        accept={RESUME_ACCEPT}
                        disabled={
                          savingApplication ||
                          keptQualificationFiles.length + editQualificationFiles.length >= 10
                        }
                        aria-label="Choose additional qualification documents"
                        onChange={(event) => {
                          const selectedFiles = Array.from(
                            event.currentTarget.files ?? [],
                          );
                          setEditQualificationFiles((current) => [
                            ...current,
                            ...selectedFiles,
                          ]);
                          event.currentTarget.value = "";
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Add up to 10 total documents ({RESUME_FORMATS_LABEL}), maximum 5 MB each.
                  </p>
                  {editQualificationFiles.length > 0 && (
                    <ul className="mt-2 space-y-2">
                      {editQualificationFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenLocalQualificationFile(file)}
                            disabled={savingApplication}
                            className="min-w-0 truncate text-left text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 disabled:opacity-60"
                          >
                            {file.name}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditQualificationFiles((current) =>
                                current.filter((_, fileIndex) => fileIndex !== index),
                              )
                            }
                            disabled={savingApplication}
                            className="shrink-0 font-semibold text-red-700 hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={cancelEditingApplication}
                    disabled={savingApplication}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingApplication}
                    className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {savingApplication ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="mt-5 grid gap-4 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Employer
                    </dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {selectedApplication.company}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Application date
                    </dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {selectedApplication.date}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </dt>
                    <dd className="mt-1">
                      <StatusBadge status={selectedApplication.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Name submitted
                    </dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {selectedApplication.applicantName || seeker.full_name || "Not available"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Email submitted
                    </dt>
                    <dd className="mt-1 break-all font-medium text-gray-900">
                      {selectedApplication.applicantEmail || seeker.email || "Not available"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Contact number
                    </dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {selectedApplication.contactNumber || "Not available"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Address
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap font-medium text-gray-900">
                      {selectedApplication.address || "Not available"}
                    </dd>
                  </div>
                </dl>

                {resumeError && (
                  <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {resumeError}
                  </p>
                )}

                {selectedApplication.resumeUrl && (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => void handleOpenResume()}
                      disabled={openingResume}
                      className="max-w-full truncate rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {openingResume
                        ? "Opening..."
                        : `View ${getResumeFileName(selectedApplication.resumeUrl)}`}
                    </button>
                  </div>
                )}

                {selectedApplication.qualificationFiles.length > 0 && (
                  <section className="mt-5">
                    <h3 className="text-sm font-semibold text-gray-800">
                      Qualifications and requirements documents
                    </h3>
                    <div className="mt-2 flex flex-col items-start gap-2">
                      {selectedApplication.qualificationFiles.map((document) => (
                        <button
                          key={document.path}
                          type="button"
                          onClick={() => void handleOpenQualificationFile(document)}
                          disabled={openingResume}
                          className="max-w-full truncate rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          {openingResume ? "Opening..." : document.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <footer className="mt-5 flex flex-wrap justify-end gap-3">
                  {canEditApplication(selectedApplication) && (
                    <button
                      type="button"
                      onClick={() => startEditingApplication(selectedApplication)}
                      className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Edit application
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeSelectedApplication}
                    disabled={openingResume || savingApplication}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Close
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {/* Find More Jobs */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h3 className="font-semibold text-blue-900">
              Looking for more opportunities?
            </h3>

            <p className="mt-1 text-sm text-blue-700">
              Explore available job vacancies and find another opportunity
              that matches your skills.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("Jobs")}
            className="shrink-0 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Explore Jobs
          </button>

        </div>

      </div>

    </div>
  );
}
import AppIcon from "../components/AppIcon";
