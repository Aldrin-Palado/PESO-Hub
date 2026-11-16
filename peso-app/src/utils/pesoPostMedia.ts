export type PESOPostMedia = {
  type: "image" | "video";
  url: string;
};

export function getPESOPostMedia(
  images: string[] | null | undefined,
  videos: string[] | null | undefined,
): PESOPostMedia[] {
  const media: PESOPostMedia[] = [];
  const imageUrls = [...new Set(images ?? [])];
  const videoUrls = [...new Set(videos ?? [])];
  const itemCount = Math.max(imageUrls.length, videoUrls.length);

  for (let index = 0; index < itemCount; index += 1) {
    if (imageUrls[index]) {
      media.push({ type: "image", url: imageUrls[index] });
    }
    if (videoUrls[index]) {
      media.push({ type: "video", url: videoUrls[index] });
    }
  }

  return media;
}
