import { supabase } from "./supabase";

export const RESUME_BUCKET = "Resume Files";

export const RESUME_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
};

export const RESUME_ACCEPT =
  ".pdf,.doc,.docx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv";

export const RESUME_FORMATS_LABEL = "PDF, DOC, DOCX, or CSV";

export function getResumeExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function getResumeFileName(resumeValue: string): string {
  const path = resumeValue
    .split(/[?#]/, 1)[0]
    .replace(/\\/g, "/");
  const storedName = path.split("/").filter(Boolean).pop() ?? "";
  const timestampedName = storedName.match(/^\d+-(.+)$/);

  return timestampedName?.[1] ?? storedName;
}

function getResumeObjectPath(resumeUrl: string): string | null {
  const url = new URL(resumeUrl);
  const match = url.pathname.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  );

  if (!match || decodeURIComponent(match[1]) !== RESUME_BUCKET) {
    return null;
  }

  return match[2]
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

export async function getResumeUrl(resumeValue: string) {
  const trimmed = resumeValue.trim();

  if (!trimmed) {
    throw new Error("No resume has been uploaded.");
  }

  if (/^data:/i.test(trimmed)) {
    return trimmed;
  }

  let path = trimmed.replace(/^\/+/, "");

  if (/^https?:/i.test(trimmed)) {
    const storedObjectPath = getResumeObjectPath(trimmed);
    if (!storedObjectPath) return trimmed;
    path = storedObjectPath;
  }

  const bucketPrefix = `${RESUME_BUCKET}/`;
  const encodedBucketPrefix = `${encodeURIComponent(RESUME_BUCKET)}/`;

  if (path.startsWith(bucketPrefix)) {
    path = path.slice(bucketPrefix.length);
  } else if (path.startsWith(encodedBucketPrefix)) {
    path = path.slice(encodedBucketPrefix.length);
  }

  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, 60);

  if (error) throw error;

  return data.signedUrl;
}

export async function openStoredResume(resumeValue: string) {
  const resumeWindow = window.open("about:blank", "_blank");
  if (resumeWindow) resumeWindow.opener = null;

  try {
    const url = await getResumeUrl(resumeValue);
    if (resumeWindow) {
      resumeWindow.location.href = url;
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  } catch (error) {
    resumeWindow?.close();
    throw error;
  }
}

export function openLocalResumeFile(file: File) {
  const fileUrl = URL.createObjectURL(file);
  const fileWindow = window.open(fileUrl, "_blank");

  if (!fileWindow) {
    URL.revokeObjectURL(fileUrl);
    throw new Error("Your browser blocked the file preview. Allow pop-ups and try again.");
  }

  fileWindow.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 5 * 60 * 1000);
}
