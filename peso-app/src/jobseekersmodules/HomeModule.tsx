import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import AppIcon from "../components/AppIcon";
import { getPESOPostMedia, type PESOPostMedia } from "../utils/pesoPostMedia";

type Seeker = {
  job_seeker_id: string;
  full_name?: string | null;
  email?: string | null;
};

type PESOPost = {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_urls: string[] | null;
  created_at: string;
};

type PESOAnnouncement = {
  id: string;
  title: string;
  message: string;
  created_at: string;
};

type JobSeekerPage =
  | "Home"
  | "Jobs"
  | "Applications"
  | "Messages"
  | "Profile";

type Props = {
  seeker: Seeker;
  profileComplete: boolean;
  onNavigate: (page: JobSeekerPage) => void;
};

function readSeenIds(storageKey: string): string[] {
  try {
    const storedValue = localStorage.getItem(storageKey);
    if (!storedValue) return [];
    const parsed: unknown = JSON.parse(storedValue);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
      return parsed;
    }
    console.error(`Invalid seen-post data in local storage: ${storageKey}`);
  } catch (error) {
    console.error(`Could not read seen-post data from local storage: ${storageKey}`, error);
  }
  return [];
}

function saveSeenIds(storageKey: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch (error) {
    console.error(`Could not save seen-post data to local storage: ${storageKey}`, error);
  }
}

export default function HomeModule({
  seeker,
  profileComplete,
  onNavigate,
}: Props) {
  const [pesoPosts, setPesoPosts] = useState<PESOPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [announcements, setAnnouncements] = useState<PESOAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [seenPostIds, setSeenPostIds] = useState<string[]>([]);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState<string[]>([]);
  const [updatesView, setUpdatesView] = useState<"posts" | "announcements">(
    "posts",
  );
  const [selectedPESOPost, setSelectedPESOPost] = useState<PESOPost | null>(null);
  const [viewingMedia, setViewingMedia] = useState<PESOPostMedia[] | null>(null);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);

  const getPostImages = (post: PESOPost) =>
    [...new Set([...(post.image_urls ?? []), ...(post.image_url ? [post.image_url] : [])])];
  const getPostVideos = (post: PESOPost) =>
    [...new Set(post.video_urls ?? [])];
  const getPostMedia = (post: PESOPost) =>
    getPESOPostMedia(getPostImages(post), getPostVideos(post));

  const firstName =
    seeker.full_name?.trim().split(" ")[0] || "Job Seeker";

  useEffect(() => {
    let active = true;
    setSeenPostIds(
      readSeenIds(`job-seeker-seen-peso-posts-${seeker.job_seeker_id}`),
    );
    setSeenAnnouncementIds(
      readSeenIds(`job-seeker-seen-peso-announcements-${seeker.job_seeker_id}`),
    );

    const loadPESOPosts = async () => {
      const { data, error } = await supabase
        .from("peso_posts")
        .select("id, title, content, category, image_url, image_urls, video_urls, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(4);

      if (!active) return;

      if (error) {
        console.error("Could not load published PESO posts:", error);
        setPostsError("PESO updates are temporarily unavailable. Please try again later.");
      } else {
        setPesoPosts((data ?? []) as PESOPost[]);
      }

      setPostsLoading(false);
    };

    const channel = supabase
      .channel(`job-seeker-peso-posts-${seeker.job_seeker_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "peso_posts" },
        () => void loadPESOPosts(),
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          void loadPESOPosts();
        } else if (error) {
          console.error("Could not subscribe to PESO post updates:", error);
        }
      });

    void loadPESOPosts();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [seeker.job_seeker_id]);

  useEffect(() => {
    let active = true;

    const loadAnnouncements = async () => {
      const { data, error } = await supabase
        .from("peso_announcements")
        .select("id, title, message, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active) return;

      if (error) {
        console.error("Could not load PESO announcements:", error);
        setAnnouncementsError(
          "Announcements are temporarily unavailable. Please try again later.",
        );
      } else {
        setAnnouncements((data ?? []) as PESOAnnouncement[]);
      }

      setAnnouncementsLoading(false);
    };

    const channel = supabase
      .channel(`job-seeker-peso-announcements-${seeker.job_seeker_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "peso_announcements" },
        () => void loadAnnouncements(),
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          void loadAnnouncements();
        } else if (error) {
          console.error("Could not subscribe to PESO announcement updates:", error);
        }
      });

    void loadAnnouncements();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const markPESOUpdatesSeen = () => {
    const ids = [...new Set([...seenPostIds, ...pesoPosts.map((post) => post.id)])];
    setSeenPostIds(ids);
    saveSeenIds(`job-seeker-seen-peso-posts-${seeker.job_seeker_id}`, ids);
  };

  const markAnnouncementsSeen = () => {
    const ids = [
      ...new Set([
        ...seenAnnouncementIds,
        ...announcements.map((announcement) => announcement.id),
      ]),
    ];
    setSeenAnnouncementIds(ids);
    saveSeenIds(
      `job-seeker-seen-peso-announcements-${seeker.job_seeker_id}`,
      ids,
    );
  };

  const unseenPESOUpdates = pesoPosts.filter(
    (post) => !seenPostIds.includes(post.id),
  ).length;
  const unseenAnnouncements = announcements.filter(
    (announcement) => !seenAnnouncementIds.includes(announcement.id),
  ).length;

  const selectedPostMedia = selectedPESOPost
    ? getPostMedia(selectedPESOPost)
    : [];

  useEffect(() => {
    if (!selectedPESOPost && !viewingMedia) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (viewingMedia) setViewingMedia(null);
        else setSelectedPESOPost(null);
      }
      if (viewingMedia?.length) {
        if (event.key === "ArrowRight") {
          setViewingImageIndex((index) => (index + 1) % viewingMedia.length);
        }
        if (event.key === "ArrowLeft") {
          setViewingImageIndex((index) =>
            (index - 1 + viewingMedia.length) % viewingMedia.length,
          );
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPESOPost, viewingMedia]);

  useEffect(() => {
    const imageUrls = [
      ...new Set([
        ...(selectedPESOPost?.image_urls ?? []),
        ...(selectedPESOPost?.image_url ? [selectedPESOPost.image_url] : []),
        ...(viewingMedia ?? [])
          .filter((media) => media.type === "image")
          .map((media) => media.url),
      ]),
    ];
    imageUrls.forEach((url) => {
      const image = new Image();
      image.fetchPriority = "low";
      image.src = url;
    });
  }, [selectedPESOPost, viewingMedia]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">

      {/* Welcome Post */}
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-7 text-white">

          <p className="mb-1 text-sm text-blue-100">
            Welcome back, {firstName}
          </p>

          <h1 className="text-2xl font-bold">
            Find opportunities that match your skills.
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-blue-100">
            Explore job opportunities, track your applications,
            communicate with employers, and keep your profile updated.
          </p>

          <button
            type="button"
            onClick={() => onNavigate("Jobs")}
            className="mt-5 rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-yellow-300"
          >
            Explore Jobs
          </button>

        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex">

          <button
            type="button"
            onClick={() => {
              markPESOUpdatesSeen();
              setUpdatesView("posts");
            }}
            aria-pressed={updatesView === "posts"}
            aria-label={`PESO Updates${unseenPESOUpdates ? `, ${unseenPESOUpdates} new` : ""}`}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
              updatesView === "posts"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <span className="relative">
              <AppIcon name="bell" className="h-5 w-5" />
              {unseenPESOUpdates > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                />
              )}
            </span>
            PESO Updates
          </button>

          <div className="w-px bg-gray-200" />

          <button
            type="button"
            onClick={() => {
              markAnnouncementsSeen();
              setUpdatesView("announcements");
            }}
            aria-pressed={updatesView === "announcements"}
            aria-label={`Announcements${unseenAnnouncements ? `, ${unseenAnnouncements} new` : ""}`}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
              updatesView === "announcements"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <span className="relative">
              <AppIcon name="megaphone" className="h-5 w-5" />
              {unseenAnnouncements > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                />
              )}
            </span>
            Announcements
          </button>

        </div>
      </div>

      {updatesView === "posts" ? (
      <section
        id="job-seeker-peso-updates"
        className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        aria-labelledby="job-seeker-peso-updates-heading"
      >
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            PESO Mabini
          </p>
          <h2 id="job-seeker-peso-updates-heading" className="mt-1 text-lg font-bold text-gray-900">
            PESO Posts
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Programs, activities, events, and announcements from PESO Mabini.
          </p>
        </div>

        {postsLoading ? (
          <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
            Loading PESO updates...
          </p>
        ) : postsError ? (
          <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-800">
            {postsError}
          </p>
        ) : pesoPosts.length === 0 ? (
          <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
            There are no posts at the moment.
          </p>
        ) : (
          <div className="grid gap-6">
            {pesoPosts.map((post) => {
              const postMedia = getPostMedia(post);
              return (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-md ring-1 ring-gray-900/5 transition hover:shadow-lg"
                >
                  {postMedia.length > 0 && (
                    <div className={`grid gap-1 ${postMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {postMedia.slice(0, 4).map((media, index) => (
                        <button
                          key={media.url}
                          type="button"
                          onClick={() => {
                            setViewingImageIndex(index);
                            setViewingMedia(postMedia);
                          }}
                          aria-label={`View ${media.type} ${index + 1} of ${postMedia.length} for ${post.title}`}
                          className="group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                        >
                          {media.type === "image" ? (
                            <img
                              src={media.url}
                              alt=""
                              loading="lazy"
                              className="h-52 w-full bg-slate-50 object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <>
                              <video
                                src={media.url}
                                muted
                                playsInline
                                preload="metadata"
                                aria-hidden="true"
                                className="h-52 w-full bg-slate-950 object-contain"
                              />
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/10 transition group-hover:bg-slate-950/20">
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-blue-600 shadow-xl ring-1 ring-white/70 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                    className="ml-0.5 h-7 w-7"
                                  >
                                    <path d="M7 4.75v14.5L19 12 7 4.75Z" />
                                  </svg>
                                </span>
                              </span>
                            </>
                          )}
                          {index === 3 && postMedia.length > 4 && (
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-lg font-bold text-white">
                              +{postMedia.length - 4}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {post.category}
                      </span>
                      <time
                        dateTime={post.created_at}
                        className="text-xs text-gray-400"
                      >
                        {new Date(post.created_at).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                    <h3 className="mt-3 font-bold text-gray-900">{post.title}</h3>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                      {post.content}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setViewingImageIndex(0);
                        setSelectedPESOPost(post);
                      }}
                      className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900"
                    >
                      See more
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      ) : (
      <section
        id="job-seeker-announcements"
        className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        aria-labelledby="job-seeker-announcements-heading"
      >
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            Important
          </p>
          <h2
            id="job-seeker-announcements-heading"
            className="mt-1 text-lg font-bold text-gray-900"
          >
            Announcements
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Important updates from PESO Mabini.
          </p>
        </div>

        {announcementsLoading ? (
          <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
            Loading announcements...
          </p>
        ) : announcementsError ? (
          <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-800">
            {announcementsError}
          </p>
        ) : announcements.length === 0 ? (
          <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">
            There are no announcements at the moment.
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <time
                  dateTime={announcement.created_at}
                  className="text-xs text-gray-400"
                >
                  {new Date(announcement.created_at).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <h3 className="mt-2 font-bold text-gray-900">
                  {announcement.title}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {announcement.message}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {selectedPESOPost && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedPESOPost(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-seeker-peso-announcement-title"
            className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {selectedPESOPost.category}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPESOPost(null)}
                aria-label="Close announcement"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <AppIcon name="x" className="h-5 w-5" />
              </button>
            </div>
            {selectedPostMedia.length > 0 && (
              <div className="relative flex min-h-64 items-center justify-center bg-slate-950 p-3 sm:min-h-[28rem] sm:p-5">
                {selectedPostMedia[viewingImageIndex % selectedPostMedia.length].type === "image" ? (
                  <img
                    src={selectedPostMedia[viewingImageIndex % selectedPostMedia.length].url}
                    alt={`${selectedPESOPost.title}, media ${(viewingImageIndex % selectedPostMedia.length) + 1}`}
                    className="max-h-[65vh] max-w-full object-contain"
                  />
                ) : (
                  <video
                    key={selectedPostMedia[viewingImageIndex % selectedPostMedia.length].url}
                    src={selectedPostMedia[viewingImageIndex % selectedPostMedia.length].url}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    aria-label={`${selectedPESOPost.title}, video ${(viewingImageIndex % selectedPostMedia.length) + 1}`}
                    className="max-h-[65vh] max-w-full object-contain"
                  />
                )}
                {selectedPostMedia.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setViewingImageIndex(
                          (index) =>
                            (index - 1 + selectedPostMedia.length) %
                            selectedPostMedia.length,
                        )
                      }
                      aria-label="Previous media"
                      className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                    >
                      <AppIcon name="arrowLeft" className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setViewingImageIndex(
                          (index) => (index + 1) % selectedPostMedia.length,
                        )
                      }
                      aria-label="Next media"
                      className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                    >
                      <AppIcon name="arrowRight" className="h-5 w-5" />
                    </button>
                  </>
                )}
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
                  {(viewingImageIndex % selectedPostMedia.length) + 1} / {selectedPostMedia.length}
                </span>
              </div>
            )}
            <div className="p-5 sm:p-7">
              <time className="text-sm text-slate-500" dateTime={selectedPESOPost.created_at}>
                {new Date(selectedPESOPost.created_at).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <h2 id="job-seeker-peso-announcement-title" className="mt-2 text-2xl font-black text-slate-900">
                {selectedPESOPost.title}
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                {selectedPESOPost.content}
              </p>
            </div>
          </section>
        </div>
      )}

      {viewingMedia && viewingMedia.length > 0 && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingMedia(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`${viewingMedia[viewingImageIndex].type} ${viewingImageIndex + 1} of ${viewingMedia.length}`}
        >
          <button
            type="button"
            onClick={() => setViewingMedia(null)}
            aria-label="Close image viewer"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <AppIcon name="x" className="h-5 w-5" />
          </button>
          {viewingMedia.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setViewingImageIndex((index) =>
                  (index - 1 + viewingMedia.length) % viewingMedia.length,
                )
              }
              aria-label="Previous media"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
            >
              <AppIcon name="arrowLeft" className="h-5 w-5" />
            </button>
          )}
          <figure className="flex max-h-full max-w-full flex-col items-center gap-3">
            {viewingMedia[viewingImageIndex].type === "image" ? (
              <img
                src={viewingMedia[viewingImageIndex].url}
                alt={`PESO post image ${viewingImageIndex + 1}`}
                className="max-h-[88vh] max-w-[92vw] object-contain"
              />
            ) : (
              <video
                key={viewingMedia[viewingImageIndex].url}
                src={viewingMedia[viewingImageIndex].url}
                controls
                autoPlay
                playsInline
                preload="metadata"
                aria-label={`PESO post video ${viewingImageIndex + 1}`}
                className="max-h-[88vh] max-w-[92vw] object-contain"
              />
            )}
            <figcaption className="text-sm text-white/80">
              {viewingImageIndex + 1} / {viewingMedia.length}
            </figcaption>
          </figure>
          {viewingMedia.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setViewingImageIndex((index) => (index + 1) % viewingMedia.length)
              }
              aria-label="Next media"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
            >
              <AppIcon name="arrowRight" className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

    </div>
  );
}
