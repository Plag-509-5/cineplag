import {
  ALL_DEMO_ITEMS,
  cleanDisplayTitle,
  cleanSectionTitle,
  computeAccurateVersionLabel,
  fallbackDetail,
  formatDubDisplayName,
  EDITORIAL,
  SECTION_TO_TYPE,
  WEBTOON_PREVIEW,
  type CastMember,
  type CatalogCategorySection,
  type CatalogDetail,
  type CatalogItem,
  type CatalogSection,
  type ContentType,
  type DubLanguage,
  type Episode,
  type SeasonEntry,
} from "@/lib/catalog-data";
import { fetchMovieboxJson, toMovieboxSubtitleProxyUrl } from "@/lib/moviebox-api";

const streamCache = new Map<string, any>();
const detailCache = new Map<string, any>();

function unwrapData(payload: any): any {
  return payload?.data ?? payload?.result ?? payload;
}

function getList(payload: any): any[] {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data;
  const list = data?.items ?? data?.list ?? data?.subjects ?? data?.results;
  return Array.isArray(list) ? list : [];
}

function getLastPage(payload: any, page: number, itemCount: number): number {
  const data = unwrapData(payload);
  const value =
    data?.last_page ?? data?.lastPage ?? data?.total_pages ?? data?.totalPages ??
    data?.pagination?.last_page ?? data?.pagination?.total_pages ??
    data?.meta?.last_page ?? data?.meta?.total_pages;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 1) return Math.max(page, Math.floor(parsed));
  return itemCount >= 24 ? page + 1 : page;
}

function imageValue(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return String(value.url || value.src || value.path || "");
  }
  return "";
}

function captionList(payload: any): any[] {
  const data = unwrapData(payload);
  const captions = data?.subtitles ?? data?.captions ?? data?.list ?? data;
  return Array.isArray(captions) ? captions : [];
}

export function validType(value: string): value is ContentType {
  return value === "movie" || value === "series" || value === "anime" || value === "drama" || value === "webtoon";
}

export function validSection(value: string): value is CatalogSection | "home" {
  return (
    value === "home" ||
    value === "movies" ||
    value === "series" ||
    value === "anime" ||
    value === "dramas" ||
    value === "webtoons"
  );
}

function mapSubjectToItem(sub: any, defaultType: ContentType = "movie"): CatalogItem {
  const subjectType = sub.subjectType ?? sub.subject_type;
  const rawTitle = String(sub.title || sub.name || "");
  const isSeries = subjectType === 2 || (rawTitle && /(?:saison|season|s\d+)/i.test(rawTitle));
  let type: ContentType = defaultType;
  if (defaultType === "anime") type = "anime";
  else if (defaultType === "drama") type = "drama";
  else if (defaultType === "webtoon") type = "webtoon";
  else type = isSeries ? "series" : "movie";

  const title = cleanDisplayTitle(rawTitle);
  const releaseDate = sub.releaseDate ?? sub.release_date;
  const year = sub.releaseTime ?? sub.release_time ?? (releaseDate ? String(releaseDate).slice(0, 4) : undefined);
  const rawGenres = sub.genres ?? sub.genre;
  const genres = Array.isArray(rawGenres)
    ? rawGenres.map((genre: unknown) => String(genre).trim()).filter(Boolean)
    : rawGenres
      ? String(rawGenres).split(",").map((genre: string) => genre.trim()).filter(Boolean)
      : [];
  const sMatch = rawTitle.match(/S1-S(\d+)/i) || rawTitle.match(/S(\d+)/i);
  const seasonsCount = sMatch ? parseInt(sMatch[1], 10) : sub.season ?? (isSeries ? 1 : undefined);
  const cover = imageValue(sub.cover) || imageValue(sub.poster) || imageValue(sub.stills);
  const score = sub.score ?? sub.imdbRatingValue ?? sub.imdb_rating_value;
  const subjectId = sub.subjectId ?? sub.subject_id ?? sub.id ?? sub.detailPath ?? sub.detail_path;

  return {
    title,
    slug: subjectId === undefined || subjectId === null ? "" : String(subjectId),
    image: cover,
    type,
    version: computeAccurateVersionLabel({ ...sub, title: rawTitle }),
    year: year ? String(year) : undefined,
    genres,
    latest_episode: sub.corner ?? sub.latest_episode ?? undefined,
    seasonsCount,
    rating: score && score !== "N/A" ? String(score) : undefined,
    duration: sub.runtime ?? (sub.duration ? `${Math.round(Number(sub.duration) / 60)} min` : undefined),
  };
}

export async function listCatalog(
  section: CatalogSection | "home",
  page = 1,
  genre = "",
  sort = "latest"
) {
  if (section === "webtoons") {
    const previews = WEBTOON_PREVIEW;
    return {
      sections: [{ id: "webtoons-all", title: "Tous les Webtoons", items: previews }],
      banners: previews.slice(0, 3),
      items: previews,
      meta: { page: 1, last_page: 1 },
      source: "curated" as const,
      notice: "Aperçu des webtoons sélectionné.",
    };
  }

  try {
    let endpoint = "/home";
    let defaultType: ContentType = "movie";

    if (section === "movies") {
      endpoint = "/movies";
      defaultType = "movie";
    } else if (section === "series") {
      endpoint = "/western";
      defaultType = "series";
    } else if (section === "anime") {
      endpoint = "/anime";
      defaultType = "anime";
    } else if (section === "dramas") {
      endpoint = "/asian";
      defaultType = "drama";
    }

    const json = await fetchMovieboxJson<any>(`${endpoint}?page=${Math.max(1, page)}`, {}, 10000);
    const data = unwrapData(json);
    const list = Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data?.sections)
        ? data.sections
        : getList(json);

    const bannerGroup = list.find((entry: any) => entry?.type === "BANNER");
    const banners: CatalogItem[] = (bannerGroup?.items || [])
      .filter((item: any) => Boolean(item?.title && (item.cover || item.poster || item.image)))
      .map((item: any) => mapSubjectToItem(item, defaultType))
      .filter((item: CatalogItem) => item.slug);

    let sections: CatalogCategorySection[] = list
      .filter(
        (entry: any) =>
          (entry?.type === "SUBJECTS_MOVIE" || (entry?.type === "CUSTOM" && entry.items?.length >= 4)) &&
          !entry.title?.includes("Stars") &&
          !entry.title?.includes("Learning") &&
          !entry.title?.includes("Cricket")
      )
      .map((entry: any) => ({
        id: String(entry.title || "catalog-section"),
        title: cleanSectionTitle(String(entry.title || "")),
        rawTitle: entry.title,
        items: (entry.items || [])
          .filter((item: any) => Boolean(item?.title && item.title !== "Unknown" && (item.cover || item.poster || item.image)))
          .map((item: any) => mapSubjectToItem(item, defaultType))
          .filter((item: CatalogItem) => item.slug),
      }))
      .filter((entry: CatalogCategorySection) => entry.items.length >= 3);

    let uniqueItems: CatalogItem[] = [];
    const seen = new Set<string>();
    for (const category of sections) {
      for (const item of category.items) {
        const key = `${item.type}:${item.slug}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueItems.push(item);
        }
      }
    }

    // Some API responses return a flat list instead of the home-style section groups.
    if (uniqueItems.length === 0) {
      uniqueItems = list
        .filter((item: any) => Boolean(item?.title && (item.cover || item.poster || item.image)))
        .map((item: any) => mapSubjectToItem(item, defaultType))
        .filter((item: CatalogItem) => item.slug);
      if (uniqueItems.length >= 3) {
        sections = [{
          id: `${section}-all`,
          title: section === "home" ? "Sélection à la une" : `Catalogue ${section}`,
          items: uniqueItems,
        }];
      }
    }

    if (uniqueItems.length > 0) {
      const normalizedGenre = genre.trim().toLocaleLowerCase();
      const matchesGenre = (item: CatalogItem) =>
        !normalizedGenre || (item.genres || []).some((value) => value.toLocaleLowerCase().includes(normalizedGenre));
      const filteredItems = uniqueItems.filter(matchesGenre);
      const filteredSections = sections
        .map((category) => ({ ...category, items: category.items.filter(matchesGenre) }))
        .filter((category) => category.items.length > 0);
      const orderedItems = sort === "az"
        ? [...filteredItems].sort((a, b) => a.title.localeCompare(b.title, "fr"))
        : filteredItems;

      return {
        sections: filteredSections,
        banners: banners.length > 0 ? banners : orderedItems.slice(0, 5),
        items: orderedItems,
        meta: { page, last_page: getLastPage(json, page, orderedItems.length) },
        source: "live" as const,
        notice: "",
      };
    }
  } catch {}

  const fallbackItems =
    section === "home"
      ? EDITORIAL
      : EDITORIAL.filter((item) => item.type === SECTION_TO_TYPE[section as CatalogSection]);

  return {
    sections: [
      {
        id: "curated-section",
        title: section === "home" ? "Sélection à la une" : `Catalogue ${section}`,
        items: fallbackItems,
      },
    ],
    banners: fallbackItems.slice(0, 4),
    items: fallbackItems,
    meta: { page: 1, last_page: 1 },
    source: "curated" as const,
    notice: "",
  };
}

export async function searchCatalog(query: string) {
  const q = query.trim();
  if (q.length < 1) return { items: [] as CatalogItem[], source: "live" as const, notice: "" };

  try {
    const json = await fetchMovieboxJson<any>(`/search?q=${encodeURIComponent(q)}&page=1`, {}, 10000);
    const itemsRaw = getList(json);
    if (itemsRaw.length > 0) {
      const items: CatalogItem[] = itemsRaw
        .filter((subject: any) => Boolean(subject?.title || subject?.name))
        .map((subject: any) => mapSubjectToItem(subject))
        .filter((item: CatalogItem) => item.slug);

      if (items.length > 0) return { items, source: "live" as const, notice: "" };
    }
  } catch {}

  const localMatches = ALL_DEMO_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(q.toLowerCase())
  );
  return { items: localMatches, source: "curated" as const, notice: "" };
}

export async function getSearchSuggestions(query: string) {
  const q = query.trim();
  if (q.length < 1) return { suggestions: [] };

  try {
    const json = await fetchMovieboxJson<any>(`/search-suggestions?q=${encodeURIComponent(q)}`, {}, 7000);
    const items = getList(json);
    if (items.length > 0) {
      const suggestions = items.map((item: any) => {
        const rawTitle = String(item.title || item.word || "");
        const subjectId = item.subjectId ?? item.subject_id ?? item.id;
        return {
          title: cleanDisplayTitle(rawTitle),
          slug: String(subjectId || `search-${encodeURIComponent(rawTitle)}`),
          image: imageValue(item.cover) || imageValue(item.poster) || imageValue(item.image),
          type: ((item.subjectType ?? item.subject_type) === 2 ? "series" : "movie") as ContentType,
        };
      }).filter((item) => Boolean(item.title && item.slug));
      return { suggestions: suggestions.slice(0, 8) };
    }
  } catch {}

  const searchFallback = await searchCatalog(q);
  return {
    suggestions: (searchFallback.items || []).slice(0, 8).map((item) => ({
      title: item.title,
      slug: item.slug,
      image: item.image,
      type: item.type,
      year: item.year,
      version: item.version,
    })),
  };
}

export async function resolveNumericSubjectId(slug: string): Promise<string> {
  const input = slug.trim();
  if (/^\d+$/.test(input)) return input;

  const clean = input
    .replace(/-[a-zA-Z0-9]{8,15}$/, "")
    .replace(/-/g, " ")
    .replace(/(?:saison|season)\s*\d+/gi, "")
    .replace(/\s*(?:vf|vostfr)/gi, "")
    .trim();

  try {
    const json = await fetchMovieboxJson<any>(`/search?q=${encodeURIComponent(clean)}&page=1`, {}, 7000);
    const first = getList(json)[0];
    const subjectId = first?.subjectId ?? first?.subject_id ?? first?.id;
    if (subjectId !== undefined && subjectId !== null) return String(subjectId);
  } catch {}

  return input;
}

export async function getCatalogDetail(
  type: ContentType,
  slug: string
): Promise<{ detail: CatalogDetail | null; source: "live" | "curated" }> {
  const cacheKey = `detail:${slug}`;
  if (detailCache.has(cacheKey)) {
    return { detail: detailCache.get(cacheKey), source: "live" };
  }

  try {
    const numericId = await resolveNumericSubjectId(slug);

    const json = await fetchMovieboxJson<any>(`/detail/${encodeURIComponent(numericId)}`, {}, 12000);
    const detailData = unwrapData(json);
    const sub = detailData?.subject || detailData?.detail || detailData?.subjectDetail || detailData;

    if (sub && (sub.title || sub.name || sub.id || sub.subjectId || sub.subject_id)) {
      const rawTitle = String(sub.title || sub.name || "");
      const title = cleanDisplayTitle(rawTitle);
      const isSeries = (sub.subjectType ?? sub.subject_type) === 2 || (rawTitle && /(?:saison|season|s\d+)/i.test(rawTitle));
      const actualType: ContentType = type === "webtoon" ? "webtoon" : isSeries ? "series" : type;

      const rawGenres = sub.genres ?? sub.genre;
      const genres = Array.isArray(rawGenres)
        ? rawGenres.map((genre: unknown) => String(genre).trim()).filter(Boolean)
        : rawGenres ? String(rawGenres).split(",").map((genre: string) => genre.trim()).filter(Boolean) : [];
      const releaseDate = sub.releaseDate ?? sub.release_date;
      const year = String(sub.releaseTime ?? sub.release_time ?? (releaseDate ? String(releaseDate).slice(0, 4) : ""));

      const rawCast = sub.cast ?? sub.actors;
      const cast: CastMember[] = Array.isArray(rawCast)
        ? rawCast.map((member: any) => ({
            name: String(member.name || ""),
            role: String(member.role || member.character || ""),
            avatar: imageValue(member.avatar) || undefined,
          }))
        : [];

      // Keep both MovieBox subject and resource identifiers: the API accepts them separately.
      const rawLangs = Array.isArray(sub.languages) ? sub.languages : Array.isArray(sub.audioTracks) ? sub.audioTracks : [];
      const languages: DubLanguage[] = rawLangs
        .filter((language: any) => language && (language.subjectId || language.subject_id || language.resourceId || language.resource_id || language.id))
        .map((language: any) => {
          const languageName = String(language.name || language.language || language.lang || "Audio");
          const isOriginal = languageName.toLowerCase().includes("original");
          const isFrench = /french|français|version française/i.test(languageName);
          const resourceId = language.resourceId ?? language.resource_id ?? language.id;
          const subjectId = language.subjectId ?? language.subject_id ?? numericId;
          return {
            id: resourceId === undefined || resourceId === null ? null : String(resourceId),
            resourceId: resourceId === undefined || resourceId === null ? null : String(resourceId),
            subjectId: String(subjectId),
            name: languageName,
            displayName: formatDubDisplayName(languageName),
            type: String(language.type || "dub"),
            isOriginal,
            isFrench,
          };
        });

      const originalSubjectId = languages.find((language) => language.isOriginal)?.subjectId || numericId;
      let frenchSubjectId = languages.find((language) => language.isFrench)?.subjectId;

      // If no French dub in languages array, check if a dedicated French dub subject exists
      if (!frenchSubjectId) {
        try {
          const frJson = await fetchMovieboxJson<any>(`/search?q=${encodeURIComponent(title + " Version française")}&page=1`, {}, 5000);
          const frMatch = getList(frJson).find((item: any) =>
            /version française|french|français/i.test(String(item.title || "")) &&
            cleanDisplayTitle(String(item.title || "")).toLowerCase() === title.toLowerCase()
          );
          const frSubject = frMatch?.subjectId ?? frMatch?.subject_id ?? frMatch?.id;
          if (frSubject !== undefined && frSubject !== null) {
            frenchSubjectId = String(frSubject);
            if (!languages.some((l) => l.subjectId === frenchSubjectId)) {
              languages.unshift({
                id: null,
                subjectId: frenchSubjectId,
                name: "French dub",
                displayName: "Français (VF)",
                type: "dub",
                isFrench: true,
              });
            }
          }
        } catch {}
      }

      let seasons: SeasonEntry[] = [];
      let episodes: Episode[] = [];

      if (isSeries) {
        try {
          const epJson = await fetchMovieboxJson<any>(`/episodes/${encodeURIComponent(numericId)}`, {}, 10000);
          const episodeData = unwrapData(epJson);
          const seasonsRaw = Array.isArray(episodeData?.seasons)
            ? episodeData.seasons
            : Array.isArray(episodeData)
              ? episodeData
              : [];

          if (seasonsRaw.length > 0) {
            seasons = seasonsRaw.map((seasonEntry: any) => {
              const seasonNumber = String(seasonEntry.seasonNumber ?? seasonEntry.season_number ?? seasonEntry.number ?? 1);
              const seasonEpisodes = Array.isArray(seasonEntry.episodes)
                ? seasonEntry.episodes
                : Array.isArray(seasonEntry.episodeList)
                  ? seasonEntry.episodeList
                  : [];
              return {
                seasonNumber,
                title: String(seasonEntry.title || `Saison ${seasonNumber}`),
                slug: numericId,
                episodesCount: seasonEpisodes.length || Number(seasonEntry.episodesCount ?? seasonEntry.episodes_count) || 8,
                episodes: seasonEpisodes.map((episodeEntry: any) => {
                  const episodeNumber = String(episodeEntry.episodeNumber ?? episodeEntry.episode_number ?? episodeEntry.number ?? 1);
                  return {
                    episode_id: String(episodeEntry.id || episodeEntry.resourceId || episodeEntry.resource_id || `${numericId}_${seasonNumber}_${episodeNumber}`),
                    season: seasonNumber,
                    number: episodeNumber,
                    title: String(episodeEntry.title || `Épisode ${episodeNumber}`),
                    duration: String(episodeEntry.runtime || episodeEntry.duration || sub.runtime || "48 min"),
                    size: "450 Mo",
                    version: computeAccurateVersionLabel(sub, languages),
                  };
                }),
              };
            });

            for (const s of seasons) {
              if (s.episodes) episodes.push(...s.episodes);
            }
          }
        } catch {}
      }

      if (isSeries && seasons.length === 0) {
        seasons = [
          {
            seasonNumber: "1",
            title: "Saison 1",
            slug: numericId,
            episodesCount: 8,
          },
        ];
        for (let epNum = 1; epNum <= 8; epNum++) {
          episodes.push({
            episode_id: `${numericId}_1_${epNum}`,
            season: "1",
            number: String(epNum),
            title: `Épisode ${epNum}`,
            duration: sub.runtime || "45 min",
            size: "420 Mo",
            version: computeAccurateVersionLabel(sub, languages),
          });
        }
      }

      const version = computeAccurateVersionLabel(sub, languages);

      const score = sub.score ?? sub.imdbRatingValue ?? sub.imdb_rating_value;
      const detailResult: CatalogDetail = {
        title,
        baseTitle: title,
        slug: numericId,
        image: imageValue(sub.cover) || imageValue(sub.poster) || imageValue(sub.image),
        type: actualType,
        version,
        synopsis: String(sub.description || sub.synopsis || "Aucun synopsis disponible."),
        genres,
        year,
        status: score && score !== "N/A" ? `★ ${score}/10` : "Disponible",
        duration: sub.runtime || sub.duration || undefined,
        episodes,
        seasons: seasons.length > 0 ? seasons : undefined,
        chapters: [],
        first_episode_id: episodes[0]?.episode_id || `${numericId}_1_1`,
        first_chapter_id: null,
        country: sub.countryName || sub.country_name || sub.country,
        cast,
        languages: languages.length > 0 ? languages : undefined,
        originalSubjectId,
        frenchSubjectId,
      };

      detailCache.set(cacheKey, detailResult);
      detailCache.set(`detail:${numericId}`, detailResult);
      return { detail: detailResult, source: "live" };
    }
  } catch (e) {}

  return { detail: fallbackDetail(type, slug), source: "curated" };
}

export async function getStreamAndCaptions(
  slug: string,
  seasonNum = 1,
  episodeNum = 1,
  quality = "720p",
  subjectIdOverride?: string,
  resourceId?: string
) {
  const resolvedSlugId = await resolveNumericSubjectId(slug);
  const targetId = resourceId ? resolvedSlugId : subjectIdOverride || resolvedSlugId;
  const cacheKey = `stream:${targetId}:${resourceId || ""}:${seasonNum}:${episodeNum}:${quality}`;
  if (streamCache.has(cacheKey)) return streamCache.get(cacheKey);

  const emptyResult = {
    streamUrl: null,
    duration: 0,
    qualityList: [] as string[],
    isHls: false,
    captions: [] as any[],
    season: seasonNum,
    episode: episodeNum,
    subjectId: targetId,
  };

  try {
    const streamParams = new URLSearchParams({
      season: String(seasonNum),
      episode: String(episodeNum),
      quality,
    });
    if (resourceId) streamParams.set("resource_id", resourceId);

    const streamJson = await fetchMovieboxJson<any>(
      `/stream/${encodeURIComponent(targetId)}?${streamParams.toString()}`,
      {},
      25000
    );
    const streamData = unwrapData(streamJson);
    const streamUrl = streamData?.url || streamData?.streamUrl || streamData?.stream_url || streamData?.playUrl || null;
    let rawCaptions = captionList(streamData);

    if (rawCaptions.length === 0) {
      try {
        const subtitleParams = new URLSearchParams({ se: String(seasonNum), ep: String(episodeNum) });
        const subtitleJson = await fetchMovieboxJson<any>(
          `/subtitles/${encodeURIComponent(targetId)}?${subtitleParams.toString()}`,
          {},
          8000
        );
        rawCaptions = captionList(subtitleJson);
      } catch {}
    }

    const captions = rawCaptions
      .map((caption: any, index: number) => {
        const rawUrl = caption.url || caption.subtitleUrl || caption.subtitle_url || caption.src || caption.file;
        if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
        const language = String(caption.lan || caption.language || caption.lang || caption.languageCode || "");
        const id = String(caption.id || caption.resourceId || caption.resource_id || language || `caption-${index}`);
        return {
          ...caption,
          id,
          lan: language || id,
          lanName: String(caption.lanName || caption.lan_name || caption.name || language || "Sous-titres"),
          url: toMovieboxSubtitleProxyUrl(rawUrl),
        };
      })
      .filter(Boolean);

    const result = {
      ...emptyResult,
      streamUrl: typeof streamUrl === "string" ? streamUrl : null,
      duration: Number(streamData?.duration || streamData?.durationMs || 0),
      qualityList: Array.isArray(streamData?.qualityList)
        ? streamData.qualityList.map((value: unknown) => String(value))
        : Array.isArray(streamData?.quality_list)
          ? streamData.quality_list.map((value: unknown) => String(value))
          : ["1080p", "720p", "480p"],
      isHls: Boolean(streamData?.isHls ?? streamData?.is_hls) || /\.m3u8(?:$|\?)/i.test(String(streamUrl || "")),
      captions,
      season: Number(streamData?.season || seasonNum),
      episode: Number(streamData?.episode || episodeNum),
      subjectId: String(streamData?.subjectId || streamData?.subject_id || targetId),
    };

    if (result.streamUrl) streamCache.set(cacheKey, result);
    return result;
  } catch {
    return emptyResult;
  }
}
