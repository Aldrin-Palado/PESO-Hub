export const announcementImageBucket = "peso-announcement-images";

export const announcementImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const maxAnnouncementImageSize = 5 * 1024 * 1024;

export function getStoredAnnouncementImagePath(imageUrl: string): string | null {
  const marker = `/storage/v1/object/public/${announcementImageBucket}/`;
  const pathStart = imageUrl.indexOf(marker);
  if (pathStart < 0) return null;

  return decodeURIComponent(
    imageUrl.slice(pathStart + marker.length).split("?")[0],
  );
}
