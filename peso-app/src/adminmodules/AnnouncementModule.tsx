import React, { useEffect, useRef, useState } from "react";
import AutoResizeTextarea from "../components/AutoResizeTextarea";
import {
  announcementImageTypes,
  maxAnnouncementImageSize,
} from "../utils/announcementImages";

type Announcement = {
  id: string;
  title: string;
  message: string;
  image_urls: string[] | null;
  created_at: string;
};

type SelectedImage = {
  file: File;
  previewUrl: string;
};

type Props = {
  title: string;
  setTitle: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  announcements: Announcement[];
  isPublishing: boolean;
  onCreate: (images: File[]) => Promise<boolean>;
  onDelete: (id: string) => void;
  EmptyMessage: React.ComponentType<{
    message: string;
  }>;
  formatDate: (date?: string) => string;
};

export default function AnnouncementModule({
  title,
  setTitle,
  message,
  setMessage,
  announcements,
  isPublishing,
  onCreate,
  onDelete,
  EmptyMessage,
  formatDate,
}: Props) {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [imageError, setImageError] = useState("");
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      selectedImagesRef.current.forEach(({ previewUrl }) =>
        URL.revokeObjectURL(previewUrl),
      );
    },
    [],
  );

  const updateSelectedImages = (images: SelectedImage[]) => {
    selectedImagesRef.current = images;
    setSelectedImages(images);
  };

  const handleImageChange = (files: FileList | null) => {
    const newFiles = Array.from(files ?? []);
    if (newFiles.length === 0) return;

    const invalidType = newFiles.find(
      (file) => !announcementImageTypes.includes(file.type),
    );
    if (invalidType) {
      setImageError("Choose images in JPG, PNG, or WEBP format.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    const oversizedImage = newFiles.find(
      (file) => file.size > maxAnnouncementImageSize,
    );
    if (oversizedImage) {
      setImageError(`Each image must not exceed 5 MB (${oversizedImage.name}).`);
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    setImageError("");
    updateSelectedImages([
      ...selectedImagesRef.current,
      ...newFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleCreate = async () => {
    const created = await onCreate(
      selectedImages.map(({ file }) => file),
    );
    if (!created) return;

    selectedImagesRef.current.forEach(({ previewUrl }) =>
      URL.revokeObjectURL(previewUrl),
    );
    updateSelectedImages([]);
    setImageError("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-lg font-bold text-slate-800">
          Create Announcement
        </h4>

        <div className="mt-5 space-y-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Announcement title"
            disabled={isPublishing}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
          />

          <AutoResizeTextarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write your announcement..."
            rows={5}
            disabled={isPublishing}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
          />

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Images (optional)
            </label>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isPublishing}
              className="flex min-h-24 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-700">
                  Add one or more images
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  JPG, PNG, or WEBP · up to 5 MB each
                </span>
              </span>
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => handleImageChange(event.target.files)}
            />
            {imageError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {imageError}
              </p>
            )}
            {selectedImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {selectedImages.map((image, index) => (
                  <div
                    key={`${image.file.name}-${index}`}
                    className="relative overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = selectedImagesRef.current.filter(
                          (_, imageIndex) => imageIndex !== index,
                        );
                        URL.revokeObjectURL(image.previewUrl);
                        updateSelectedImages(next);
                      }}
                      disabled={isPublishing}
                      aria-label={`Remove ${image.file.name}`}
                      className="absolute right-1 top-1 rounded-full bg-slate-950/75 px-2 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                    <p className="truncate px-2 py-1 text-xs text-slate-600">
                      {image.file.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isPublishing}
            className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPublishing ? "Publishing..." : "Publish Announcement"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-lg font-bold text-slate-800">Announcements</h4>

        {announcements.length === 0 ? (
          <EmptyMessage message="No announcements have been created." />
        ) : (
          announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h5 className="font-bold text-slate-800">
                    {announcement.title}
                  </h5>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {announcement.message}
                  </p>
                  {announcement.image_urls && announcement.image_urls.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {announcement.image_urls.map((imageUrl, index) => (
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt={`${announcement.title} image ${index + 1}`}
                          className="h-32 w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-slate-400">
                    {formatDate(announcement.created_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onDelete(announcement.id)}
                  className="shrink-0 text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
