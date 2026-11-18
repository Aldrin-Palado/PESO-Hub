
import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import AppIcon from "../components/AppIcon";
import AutoResizeTextarea from "../components/AutoResizeTextarea";
import { supabase } from "../services/supabase";
import { getEmployerRegistrationChecklist } from "../services/employerRegistration";

const PROFILE_SETUP_REQUIRED_MESSAGE =
  "Please complete your Profile Setup and have your account verified before posting jobs.";
const VERIFICATION_PENDING_MESSAGE =
  "Your profile is complete, but your account is not verified yet. Please wait for your account to be verified before posting jobs.";

type JobPost = {
  job_vacancy_id: string;
  employer_id: string;
  position_title: string;
  description: string | null;
  job_qualifications: string | null;
  requirements: string | null;
  location: string;
  employment_type: string;
  job_classification: "local" | "international";
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "monthly" | "yearly";
  vacancies_available: number;
  status: string;
  date_posted: string;
  deadline: string | null;
  image_url?: string | null;
};

type Props = {
  jobs: JobPost[];
  employerId: string;
  employerName: string;
  employerLogoUrl?: string | null;
  profileComplete?: boolean;
  isVerified: boolean;
  requiresEmployerVerification?: boolean;
  onRefresh: () => Promise<void> | void;
  publisherTitle?: string;
  publisherDescription?: string;
};

type JobForm = {
  position_title: string;
  description: string;
  job_qualifications: string;
  requirements: string;
  location: string;
  employment_type: string;
  job_classification: "local" | "international";
  salary_specified: boolean;
  salary_min: string;
  salary_max: string;
  salary_period: "monthly" | "yearly";
  vacancies_available: string;
  deadline: string;
};

const emptyForm: JobForm = {
  position_title: "",
  description: "",
  job_qualifications: "",
  requirements: "",
  location: "",
  employment_type: "Full-time",
  job_classification: "local",
  salary_specified: false,
  salary_min: "",
  salary_max: "",
  salary_period: "monthly",
  vacancies_available: "1",
  deadline: "",
};

type BulletListTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
};

function formatBulletList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(?:•|-|\*)\s*$/.test(line)) return "• ";
      const content = line.replace(/^\s*(?:•|-|\*)\s*/, "").trim();
      return content ? `• ${content}` : "";
    })
    .join("\n");
}

function getSavedBulletList(value: string) {
  const formatted = formatBulletList(value)
    .split("\n")
    .filter((line) => line.trim() && line.trim() !== "•")
    .join("\n");
  return formatted || null;
}

function BulletListTextarea({
  value,
  onChange,
  ...props
}: BulletListTextareaProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const rawValue = textarea.value;
    const caret = textarea.selectionStart;
    const addedPrefixes = rawValue
      .slice(0, caret)
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.trim() &&
          !/^\s*(?:•|-|\*)\s+/.test(line),
      ).length;
    const formattedValue = formatBulletList(rawValue);

    onChange(formattedValue);
    if (formattedValue !== rawValue) {
      requestAnimationFrame(() => {
        const nextCaret = Math.min(
          formattedValue.length,
          caret + addedPrefixes * 2,
        );
        textarea.setSelectionRange(nextCaret, nextCaret);
      });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = formatBulletList(
      `${value.slice(0, start)}\n• ${value.slice(end)}`,
    );
    onChange(nextValue);

    requestAnimationFrame(() => {
      const nextCaret = Math.min(nextValue.length, start + 3);
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <AutoResizeTextarea
      {...props}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        if (value) return;
        const textarea = event.currentTarget;
        onChange("• ");
        requestAnimationFrame(() => textarea.setSelectionRange(2, 2));
      }}
    />
  );
}

const STORAGE_BUCKET = "job-images";

export default function MyJobPostModule({
  jobs,
  employerId,
  employerName,
  employerLogoUrl,
  profileComplete = true,
  isVerified,
  requiresEmployerVerification = true,
  onRefresh,
  publisherTitle = "My Job Posts",
  publisherDescription = "Add, update, or close your job vacancies from here.",
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [jobSearch, setJobSearch] = useState("");

  const [selectedImage, setSelectedImage] =
    useState<File | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(
    null
  );

  const [removeImage, setRemoveImage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: keyof JobForm, value: string) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const resetImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveImage(false);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const openCreateForm = () => {
    if (requiresEmployerVerification && !profileComplete) {
      window.alert(PROFILE_SETUP_REQUIRED_MESSAGE);
      return;
    }

    if (requiresEmployerVerification && !isVerified) {
      window.alert(VERIFICATION_PENDING_MESSAGE);
      return;
    }

    setEditingId(null);
    setForm(emptyForm);
    resetImage();
    setMessage("");
    setShowForm(true);
  };

  const openEditForm = (job: JobPost) => {
    setEditingId(job.job_vacancy_id);

    setForm({
      position_title: job.position_title ?? "",
      description: job.description ?? "",
      job_qualifications: formatBulletList(job.job_qualifications ?? ""),
      requirements: formatBulletList(job.requirements ?? ""),
      location: job.location ?? "",
      employment_type: job.employment_type ?? "Full-time",
      job_classification: job.job_classification ?? "local",
      salary_specified: job.salary_min != null || job.salary_max != null,
      salary_min: job.salary_min == null ? "" : String(job.salary_min),
      salary_max: job.salary_max == null ? "" : String(job.salary_max),
      salary_period: job.salary_period ?? "monthly",
      vacancies_available: String(job.vacancies_available || 1),
      deadline: job.deadline ? job.deadline.slice(0, 10) : "",
    });

    resetImage();

    // Display the existing job image.
    setImagePreview(job.image_url || null);

    setMessage("");
    setShowForm(true);
  };

  // IMAGE SELECTION

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setMessage("");

    // Keep accepted formats aligned with the Storage bucket's MIME allowlist.
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type
      )
    ) {
      setMessage("Please select a JPEG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    // Maximum image size: 5 MB.
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    setSelectedImage(file);
    setRemoveImage(false);

    // Preview the selected image.
    const previewUrl = URL.createObjectURL(file);

    setImagePreview(previewUrl);
  };

  // REMOVE IMAGE

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveImage(true);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  // UPLOAD IMAGE TO SUPABASE STORAGE

  const uploadJobImage = async (
    file: File,
    jobId: string
  ): Promise<string | null> => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error(
        authError?.message || "Please sign in again before uploading an image."
      );
    }

    const fileExtension =
      file.name.split(".").pop()?.toLowerCase() || "jpg";

    const filePath =
      `${user.id}/${jobId}/${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  // DELETE OLD IMAGE FROM STORAGE

  const deleteStoredImage = async (imageUrl: string | null) => {
    if (!imageUrl) return;

    try {
      const url = new URL(imageUrl);
      const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;

      const markerIndex = url.pathname.indexOf(marker);

      if (markerIndex === -1) return;

      const filePath = decodeURIComponent(
        url.pathname.substring(markerIndex + marker.length)
      );

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      if (error) {
        console.error("Failed to remove old job image:", error.message);
      }
    } catch (error) {
      console.error("Failed to remove job image:", error);
    }
  };

  // CREATE OR UPDATE JOB POST

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!employerId) {
      setMessage("Employer account not found.");
      return;
    }

    if (!editingId && requiresEmployerVerification) {
      const { data: currentEmployer, error: employerStatusError } =
        await supabase
          .from("employer")
          .select(
            "name, email, contact_person, contact_no, address, registration_details, verification_documents, is_verified",
          )
          .eq("employer_id", employerId)
          .maybeSingle();

      if (employerStatusError) {
        setMessage(
          `Unable to verify your account status: ${employerStatusError.message}`,
        );
        return;
      }

      if (!currentEmployer) {
        setMessage("Employer account not found.");
        return;
      }

      const registrationComplete = getEmployerRegistrationChecklist(
        currentEmployer.registration_details,
        currentEmployer.verification_documents,
        currentEmployer,
      ).every((item) => item.complete);

      if (!registrationComplete) {
        window.alert(PROFILE_SETUP_REQUIRED_MESSAGE);
        return;
      }

      if (!currentEmployer.is_verified) {
        window.alert(VERIFICATION_PENDING_MESSAGE);
        return;
      }
    }

    if (
      form.deadline &&
      form.deadline < new Date().toISOString().slice(0, 10)
    ) {
      setMessage("Application deadline cannot be in the past.");
      return;
    }

    if (form.salary_specified) {
      if (!form.salary_min.trim() || !form.salary_max.trim()) {
        setMessage("Enter both the minimum and maximum salary.");
        return;
      }

      const minimumSalary = Number(form.salary_min);
      const maximumSalary = Number(form.salary_max);

      if (
        !Number.isFinite(minimumSalary) ||
        !Number.isFinite(maximumSalary) ||
        minimumSalary < 0 ||
        maximumSalary < 0
      ) {
        setMessage("Enter valid non-negative salary amounts.");
        return;
      }

      if (minimumSalary > maximumSalary) {
        setMessage("Minimum salary cannot exceed maximum salary.");
        return;
      }
    }

    const salaryMin = form.salary_specified ? Number(form.salary_min) : null;
    const salaryMax = form.salary_specified ? Number(form.salary_max) : null;
    const salaryPeriod = form.salary_specified
      ? form.salary_period
      : "monthly";

    setSaving(true);
    setMessage("");

    let saveStage = "preparing the job post";

    try {
      let jobId = editingId;

      // CREATE JOB FIRST IF NEW

      if (!jobId) {
        saveStage = "creating the job post";

        const { data, error } = await supabase
          .from("job_vacancy")
          .insert({
            employer_id: employerId,
            position_title: form.position_title.trim(),
            description: form.description.trim() || null,
            job_qualifications: getSavedBulletList(form.job_qualifications),
            requirements: getSavedBulletList(form.requirements),
            location: form.location.trim(),
            employment_type: form.employment_type,
            job_classification: form.job_classification,
            salary_min: salaryMin,
            salary_max: salaryMax,
            salary_period: salaryPeriod,
            vacancies_available: Math.max(
              1,
              Number(form.vacancies_available) || 1
            ),
            deadline: form.deadline || null,
            status: "open",
          })
          .select("job_vacancy_id")
          .single();

        if (error) {
          throw new Error(error.message);
        }

        jobId = data.job_vacancy_id;
      } else {
        // UPDATE EXISTING JOB

        saveStage = "updating the job details";

        const { error } = await supabase
          .from("job_vacancy")
          .update({
            position_title: form.position_title.trim(),
            description: form.description.trim() || null,
            job_qualifications: getSavedBulletList(form.job_qualifications),
            requirements: getSavedBulletList(form.requirements),
            location: form.location.trim(),
            employment_type: form.employment_type,
            job_classification: form.job_classification,
            salary_min: salaryMin,
            salary_max: salaryMax,
            salary_period: salaryPeriod,
            vacancies_available: Math.max(
              1,
              Number(form.vacancies_available) || 1
            ),
            deadline: form.deadline || null,
          })
          .eq("job_vacancy_id", jobId)
          .eq("employer_id", employerId);

        if (error) {
          throw new Error(error.message);
        }
      }

      // GET CURRENT IMAGE URL

      const existingJob = jobs.find(
        (job) => job.job_vacancy_id === jobId
      );

      let imageUrl = existingJob?.image_url || null;

      // REMOVE IMAGE IF REQUESTED

      if (removeImage) {
        imageUrl = null;
      }

      // UPLOAD NEW IMAGE IF SELECTED

      if (selectedImage && jobId) {
        saveStage = "uploading the image to Supabase Storage";
        imageUrl = await uploadJobImage(selectedImage, jobId);
      }

      // SAVE IMAGE URL TO DATABASE

      if (jobId) {
        saveStage = "saving the image URL to the job post";

        const { error } = await supabase
          .from("job_vacancy")
          .update({
            image_url: imageUrl,
          })
          .eq("job_vacancy_id", jobId)
          .eq("employer_id", employerId);

        if (error) {
          throw new Error(error.message);
        }
      }

      // DELETE OLD IMAGE AFTER SUCCESSFUL UPDATE

      if (
        existingJob?.image_url &&
        existingJob.image_url !== imageUrl
      ) {
        await deleteStoredImage(existingJob.image_url);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      resetImage();

      setMessage(
        editingId
          ? "Job posting updated successfully."
          : "Job posting published successfully."
      );

      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Failed while ${saveStage}: ${error.message}`
          : `Failed while ${saveStage}.`
      );
    } finally {
      setSaving(false);
    }
  };

  // DELETE JOB POST

  const handleDelete = async (job: JobPost) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${job.position_title}"?`
    );

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("job_vacancy")
      .delete()
      .eq("job_vacancy_id", job.job_vacancy_id)
      .eq("employer_id", employerId);

    if (error) {
      setMessage(`Failed to delete job: ${error.message}`);
      return;
    }

    // Remove associated image from Storage.
    await deleteStoredImage(job.image_url || null);

    setMessage("Job posting deleted successfully.");

    await onRefresh();
  };

  // CHANGE JOB STATUS

  const handleStatusChange = async (
    job: JobPost,
    newStatus: string
  ) => {
    setMessage("");

    const { error } = await supabase
      .from("job_vacancy")
      .update({
        status: newStatus,
      })
      .eq("job_vacancy_id", job.job_vacancy_id)
      .eq("employer_id", employerId);

    if (error) {
      setMessage(`Failed to update status: ${error.message}`);
      return;
    }

    setMessage("Job status updated successfully.");

    await onRefresh();
  };

  // FORMAT DATE

  const formatDate = (date: string | null) => {
    if (!date) return "Not specified";

    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderJobForm = () => (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#123B70]">
          {editingId ? "Edit Job Posting" : "Create Job Posting"}
        </h2>

        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            setEditingId(null);
            resetImage();
          }}
          className="text-sm font-semibold text-slate-500"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700">
          Job Image
        </label>

        <p className="mt-1 text-xs text-slate-500">
          Upload a JPEG, PNG, WebP, or GIF job image. Maximum size: 5 MB.
        </p>

        {imagePreview && (
          <div className="mt-3">
            <img
              src={imagePreview}
              alt="Job posting preview"
              className="h-56 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain sm:h-72"
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-[#0446A7] hover:file:bg-blue-100"
          />

          {imagePreview && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Remove Image
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Job Title *
          <input
            required
            value={form.position_title}
            onChange={(event) =>
              updateField("position_title", event.target.value)
            }
            placeholder="Enter job title"
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Location *
          <input
            required
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="Enter job location"
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Employment Type
          <select
            value={form.employment_type}
            onChange={(event) =>
              updateField("employment_type", event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          >
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Temporary">Temporary</option>
            <option value="Internship">Internship</option>
          </select>
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Job Classification *
          <select
            required
            value={form.job_classification}
            onChange={(event) =>
              updateField(
                "job_classification",
                event.target.value as JobForm["job_classification"]
              )
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          >
            <option value="local">Local</option>
            <option value="international">International</option>
          </select>
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Available Vacancies *
          <input
            required
            type="number"
            min="1"
            value={form.vacancies_available}
            onChange={(event) =>
              updateField("vacancies_available", event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
        </label>

        <fieldset className="space-y-3 md:col-span-2">
          <legend className="text-sm font-semibold text-slate-700">
            Salary
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.salary_specified}
                onChange={() =>
                  setForm((previous) => ({
                    ...previous,
                    salary_specified: true,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0446A7] focus:ring-blue-500"
              />
              Specify salary
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!form.salary_specified}
                onChange={() =>
                  setForm((previous) => ({
                    ...previous,
                    salary_specified: false,
                    salary_min: "",
                    salary_max: "",
                    salary_period: "monthly",
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0446A7] focus:ring-blue-500"
              />
              Salary not specified
            </label>
          </div>
        </fieldset>

        {form.salary_specified && (
          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Minimum Salary *
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.salary_min}
                onChange={(event) => updateField("salary_min", event.target.value)}
                placeholder="Enter minimum salary"
                className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                Maximum Salary *
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary_max}
                  onChange={(event) => updateField("salary_max", event.target.value)}
                  placeholder="Enter maximum salary"
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                />
              </label>
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                Salary Period *
                <select
                  required
                  value={form.salary_period}
                  onChange={(event) =>
                    updateField(
                      "salary_period",
                      event.target.value as JobForm["salary_period"],
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Job Description *
          <AutoResizeTextarea
            required
            rows={4}
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Describe the responsibilities of the job"
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
        </label>

        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Job Qualifications
          <BulletListTextarea
            rows={4}
            value={form.job_qualifications}
            onChange={(value) => updateField("job_qualifications", value)}
            placeholder="Enter the education, skills, experience, or certifications required for this position"
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Each line is a bullet point. Press Enter to add another.
          </span>
        </label>

        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Job Requirements
          <BulletListTextarea
            rows={4}
            value={form.requirements}
            onChange={(value) => updateField("requirements", value)}
            placeholder="Enter application requirements, such as documents or other instructions"
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Each line is a bullet point. Press Enter to add another.
          </span>
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Application Deadline
          <input
            type="date"
            value={form.deadline}
            onChange={(event) => updateField("deadline", event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#0446A7] px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : editingId
              ? "Save Changes"
              : "Publish Job"}
        </button>
      </div>
    </form>
  );

  const normalizedJobSearch = jobSearch.trim().toLowerCase();
  const filteredJobPosts = jobs.filter((job) => {
    if (showForm && editingId === job.job_vacancy_id) return true;
    if (!normalizedJobSearch) return true;

    return [
      job.position_title,
      job.location,
      job.employment_type,
      job.job_classification,
      job.status,
      job.description,
      job.job_qualifications,
      job.requirements,
    ].some((value) => value?.toLowerCase().includes(normalizedJobSearch));
  });

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#123B70]">{publisherTitle}</h1>

          <p className="mt-1 text-sm text-slate-500">{publisherDescription}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search job posts</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <AppIcon name="search" className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={jobSearch}
              onChange={(event) => setJobSearch(event.target.value)}
              placeholder="Search job posts..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={openCreateForm}
            className="shrink-0 rounded-xl bg-[#0446A7] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
          >
            + New Job Post
          </button>
        </div>
      </div>

      {/* MESSAGE */}

      {message && (
        <div
          role="status"
          className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800"
        >
          {message}
        </div>
      )}

      {/* CREATE FORM */}

      {showForm && !editingId && renderJobForm()}

      {/* JOB POSTS */}

      {jobs.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-lg font-bold text-[#123B70]">
            No Job Posts Yet
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Create your first job posting to allow job seekers to apply.
          </p>

          <button
            type="button"
            onClick={openCreateForm}
            className="mt-5 rounded-xl bg-[#0446A7] px-5 py-3 text-sm font-bold text-white"
          >
            Create Job Post
          </button>
        </div>
      ) : filteredJobPosts.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-lg font-bold text-[#123B70]">
            No Matching Job Posts
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Try a different job title, location, type, or status.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredJobPosts.map((job) =>
            showForm && editingId === job.job_vacancy_id ? (
              <div key={job.job_vacancy_id} className="mx-auto w-full max-w-3xl">
                {renderJobForm()}
              </div>
            ) : (
              <article
                key={job.job_vacancy_id}
                className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
              <div className="flex items-start gap-3 px-5 pb-4 pt-5 sm:px-6">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-black ${
                    employerLogoUrl
                      ? "bg-white ring-1 ring-slate-200"
                      : "bg-[#0759AE] text-white"
                  }`}
                >
                  {employerLogoUrl ? (
                    <img
                      src={employerLogoUrl}
                      alt={`${employerName || "Company"} logo`}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    employerName.trim().charAt(0).toUpperCase() || "E"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {employerName || "Your Company"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(job.date_posted)} · {job.location}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    job.status === "open"
                      ? "bg-emerald-50 text-emerald-700"
                      : job.status === "closed"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {job.status}
                </span>
              </div>

              <div className="px-5 pb-4 sm:px-6">
                <h2 className="text-lg font-black leading-snug text-slate-950">
                  {job.position_title}
                </h2>
                <p className="mt-1.5 text-xs text-slate-600">
                  <span className="capitalize">{job.job_classification}</span>
                  {" · "}
                  {job.employment_type}
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-700">Application requirements: </span>
                  {job.requirements?.trim() || "Not specified"}
                </p>
              </div>

              {job.image_url ? (
                <div className="overflow-hidden border-y border-slate-100 bg-slate-50">
                  <img
                    src={job.image_url}
                    alt={`${job.position_title} job posting`}
                    className="h-64 w-full object-contain sm:h-80"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center border-y border-slate-100 bg-slate-50 text-sm text-slate-400">
                  No job image uploaded
                </div>
              )}

              <details className="border-b border-slate-100 px-5 py-3 sm:px-6">
                <summary className="cursor-pointer text-sm font-semibold text-[#0446A7]">
                  View full job details
                </summary>
                <div className="grid gap-4 pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">Available Vacancies</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {job.vacancies_available}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400">Application Deadline</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDate(job.deadline)}</p>
                  </div>
                  {job.description && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-400">Job Description</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                        {job.description}
                      </p>
                    </div>
                  )}
                  {job.job_qualifications && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-400">Job Qualifications</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                        {job.job_qualifications}
                      </p>
                    </div>
                  )}
                  {job.requirements && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-400">Requirements</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                        {job.requirements}
                      </p>
                    </div>
                  )}
                </div>
              </details>

              <div className="flex flex-col gap-3 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(job)}
                    className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-[#0446A7] hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  <select
                    aria-label={`Status for ${job.position_title}`}
                    value={job.status}
                    onChange={(event) =>
                      void handleStatusChange(job, event.target.value)
                    }
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(job)}
                  className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  Delete Post
                </button>
              </div>
              </article>
            )
          )}
        </div>
      )}
    </div>
  );
}
