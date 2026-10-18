import {
  ALL_DEMO_ITEMS,
  cleanDisplayTitle,
  cleanSectionTitle,
  computeAccurateVersionLabel,
  fallbackDetail,
  formatDubDisplayName,
  EDITORIAL,
  SECTION_TO_TYPE,
  TYPE_TO_SECTION,
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

const API_BASE = "http://69.48.206.15:3005";

const streamCache = new Map<string, any>();
const detailCache = new Map<string, any>();

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
  const isSeries = sub.subjectType === 2 || (sub.title && /(?:saison|season|s\d+)/i.test(sub.title));
  let type: ContentType = defaultType;
  if (defaultType === "anime") type = "anime";
  else if (defaultType === "drama") type = "drama";
  else if (defaultType === "webtoon") type = "webtoon";
  else type = isSeries ? "series" : "movie";

  const rawTitle = sub.title || "";
  const title = cleanDisplayTitle(rawTitle);
  const year = sub.releaseTime || (sub.releaseDate ? String(sub.releaseDate).slice(0, 4) : undefined);
  const genres = sub.genres || (sub.genre ? String(sub.genre).split(",").map((g: string) => g.trim()) : []);
  const sMatch = rawTitle.match(/S1-S(\d+)/i) || rawTitle.match(/S(\d+)/i);
  const seasonsCount = sMatch ? parseInt(sMatch[1], 10) : sub.season || (isSeries ? 1 : undefined);

  // Compute truth-accurate label based on actual metadata
  const version = computeAccurateVersionLabel(sub);

  return {
    title,
    slug: String(sub.subjectId || sub.id || sub.detailPath),
    image: sub.cover || sub.poster || sub.cover?.url || sub.stills?.url || "",
    type,
    version,
    year,
    genres,
    latest_episode: sub.corner || undefined,
    seasonsCount,
    rating:
      sub.score && sub.score !== "N/A"
        ? String(sub.score)
        : sub.imdbRatingValue
        ? String(sub.imdbRatingValue)
        : undefined,
    duration: sub.runtime || (sub.duration ? `${Math.round(sub.duration / 60)} min` : undefined),
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

    const res = await fetch(`${API_BASE}${endpoint}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    const list = json.data?.list || [];

    // Extract Banners
    const bannerGroup = list.find((s: any) => s.type === "BANNER");
    const banners: CatalogItem[] = (bannerGroup?.items || [])
      .filter((i: any) => Boolean(i.title && (i.cover || i.poster)))
      .map((i: any) => mapSubjectToItem(i, defaultType));

    // Extract Structured API Sections with exact grouping
    const sections: CatalogCategorySection[] = list
      .filter(
        (s: any) =>
          (s.type === "SUBJECTS_MOVIE" || (s.type === "CUSTOM" && s.items?.length >= 4)) &&
          !s.title?.includes("Stars") &&
          !s.title?.includes("Learning") &&
          !s.title?.includes("Cricket")
      )
      .map((s: any) => ({
        id: s.title,
        title: cleanSectionTitle(s.title),
        rawTitle: s.title,
        items: (s.items || [])
          .filter((i: any) => Boolean(i.title && i.title !== "Unknown" && (i.cover || i.poster)))
          .map((i: any) => mapSubjectToItem(i, defaultType)),
      }))
      .filter((s: CatalogCategorySection) => s.items.length >= 3);

    const seen = new Set<string>();
    const uniqueItems: CatalogItem[] = [];

    for (const s of sections) {
      for (const item of s.items) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          uniqueItems.push(item);
        }
      }
    }

    if (uniqueItems.length > 0) {
      return {
        sections,
        banners: banners.length > 0 ? banners : uniqueItems.slice(0, 5),
        items: uniqueItems.slice((page - 1) * 24, page * 24),
        meta: { page, last_page: Math.max(1, Math.ceil(uniqueItems.length / 24)) },
        source: "live" as const,
        notice: "",
      };
    }
  } catch (err) {}

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
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&page=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    const itemsRaw = json.data?.items || json.data || [];
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
      const items: CatalogItem[] = itemsRaw
        .filter((sub: any) => Boolean(sub?.title))
        .map((sub: any) => mapSubjectToItem(sub));

      return { items, source: "live" as const, notice: "" };
    }
  } catch (e) {}

  const localMatches = ALL_DEMO_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(q.toLowerCase())
  );
  return { items: localMatches, source: "curated" as const, notice: "" };
}

export async function getSearchSuggestions(query: string) {
  const q = query.trim();
  if (q.length < 1) return { suggestions: [] };

  try {
    const res = await fetch(`${API_BASE}/search-suggestions?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    const items = json.data || [];
    if (Array.isArray(items) && items.length > 0) {
      const suggestions = items.map((item: any) => {
        const rawTitle = item.title || item.word || "";
        return {
          title: cleanDisplayTitle(rawTitle),
          slug: String(item.subjectId || item.id || `search-${encodeURIComponent(rawTitle)}`),
          image: item.cover || item.poster || "",
          type: (item.subjectType === 2 ? "series" : "movie") as ContentType,
        };
      });
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

async function resolveNumericSubjectId(slug: string): Promise<string> {
  if (/^\d+$/.test(slug)) return slug;

  const clean = slug
    .replace(/-[a-zA-Z0-9]{8,15}$/, "")
    .replace(/-/g, " ")
    .replace(/(?:saison|season)\s*\d+/gi, "")
    .replace(/\s*(?:vf|vostfr)/gi, "")
    .trim();

  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(clean)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    const text = await res.text();
    const json = JSON.parse(text);
    const first = (json.data?.items || [])[0];
    if (first && (first.subjectId || first.id)) {
      return String(first.subjectId || first.id);
    }
  } catch {}

  return slug;
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

    const res = await fetch(`${API_BASE}/detail/${encodeURIComponent(numericId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    const sub = json.data;

    if (sub && (sub.title || sub.id || sub.subjectId)) {
      const rawTitle = sub.title || "";
      const title = cleanDisplayTitle(rawTitle);
      const isSeries = sub.subjectType === 2 || (rawTitle && /(?:saison|season|s\d+)/i.test(rawTitle));
      const actualType: ContentType = type === "webtoon" ? "webtoon" : isSeries ? "series" : type;

      const genres = sub.genres || (sub.genre ? String(sub.genre).split(",").map((g: string) => g.trim()) : []);
      const year = sub.releaseTime || (sub.releaseDate ? String(sub.releaseDate).slice(0, 4) : "");

      const cast: CastMember[] = Array.isArray(sub.cast)
        ? sub.cast.map((c: any) => ({
            name: c.name || "",
            role: c.role || "",
            avatar: c.avatar || undefined,
          }))
        : [];

      // Extract real audio dubbing and language tracks
      const rawLangs = Array.isArray(sub.languages) ? sub.languages : [];
      const languages: DubLanguage[] = rawLangs
        .filter((l: any) => l && l.subjectId && l.type === "dub")
        .map((l: any) => {
          const lName = String(l.name || "Audio");
          const isOrig = lName.toLowerCase().includes("original");
          const isFr = /french|français|version française/i.test(lName);
          return {
            id: l.id ? String(l.id) : null,
            subjectId: String(l.subjectId),
            name: lName,
            displayName: formatDubDisplayName(lName),
            type: String(l.type || "dub"),
            isOriginal: isOrig,
            isFrench: isFr,
          };
        });

      // Find original subject ID & french dub ID if present
      const originalSubjectId = languages.find((l) => l.isOriginal)?.subjectId || numericId;
      let frenchSubjectId = languages.find((l) => l.isFrench)?.subjectId;

      // If no French dub in languages array, check if a dedicated French dub subject exists
      if (!frenchSubjectId) {
        try {
          const frSearchRes = await fetch(`${API_BASE}/search?q=${encodeURIComponent(title + " Version française")}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
          const frJson = await frSearchRes.json();
          const frMatch = (frJson.data?.items || []).find((item: any) =>
            /version française|french|français/i.test(item.title) &&
            cleanDisplayTitle(item.title).toLowerCase() === title.toLowerCase()
          );
          if (frMatch && (frMatch.subjectId || frMatch.id)) {
            frenchSubjectId = String(frMatch.subjectId || frMatch.id);
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
          const epRes = await fetch(`${API_BASE}/episodes/${encodeURIComponent(numericId)}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
          const epText = await epRes.text();
          let epJson: any = {};
          try {
            epJson = JSON.parse(epText);
          } catch {}

          const seasonsRaw = epJson.data?.seasons || [];

          if (Array.isArray(seasonsRaw) && seasonsRaw.length > 0) {
            seasons = seasonsRaw.map((s: any) => ({
              seasonNumber: String(s.seasonNumber),
              title: `Saison ${s.seasonNumber}`,
              slug: numericId,
              episodesCount: s.episodes?.length || 8,
              episodes: (s.episodes || []).map((e: any) => ({
                episode_id: String(e.id || `${numericId}_${s.seasonNumber}_${e.episodeNumber}`),
                season: String(s.seasonNumber),
                number: String(e.episodeNumber),
                title: e.title || `Épisode ${e.episodeNumber}`,
                duration: sub.runtime || "48 min",
                size: "450 Mo",
                version: computeAccurateVersionLabel(sub, languages),
              })),
            }));

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

      const detailResult: CatalogDetail = {
        title,
        baseTitle: title,
        slug: numericId,
        image: sub.cover || sub.poster || "",
        type: actualType,
        version,
        synopsis: sub.description || "Aucun synopsis disponible.",
        genres,
        year,
        status: sub.score && sub.score !== "N/A" ? `★ ${sub.score}/10` : "Disponible",
        duration: sub.runtime || undefined,
        episodes,
        seasons: seasons.length > 0 ? seasons : undefined,
        chapters: [],
        first_episode_id: episodes[0]?.episode_id || `${numericId}_1_1`,
        first_chapter_id: null,
        country: sub.countryName,
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
  subjectIdOverride?: string
) {
  const targetId = subjectIdOverride || (await resolveNumericSubjectId(slug));
  const cacheKey = `stream:${targetId}:${seasonNum}:${episodeNum}:${quality}`;
  if (streamCache.has(cacheKey)) {
    return streamCache.get(cacheKey);
  }

  try {
    const streamRes = await fetch(
      `${API_BASE}/stream/${encodeURIComponent(targetId)}?season=${seasonNum}&episode=${episodeNum}&quality=${encodeURIComponent(quality)}`,
      { cache: "no-store", signal: AbortSignal.timeout(25000) }
    );
    const text = await streamRes.text();
    let streamJson: any = {};
    try {
      streamJson = JSON.parse(text);
    } catch {
      streamJson = {};
    }

    let captions: any[] = streamJson.subtitles || [];
    if (captions.length === 0) {
      try {
        const capRes = await fetch(
          `${API_BASE}/subtitles/${encodeURIComponent(targetId)}?season=${seasonNum}&episode=${episodeNum}`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) }
        );
        const capText = await capRes.text();
        let capJson: any = {};
        try {
          capJson = JSON.parse(capText);
        } catch {}
        captions = capJson.data?.list || [];
      } catch {}
    }

    const result = {
      streamUrl: streamJson.url || null,
      duration: streamJson.duration || 0,
      qualityList: streamJson.qualityList || ["1080p", "720p", "480p"],
      isHls: Boolean(streamJson.isHls),
      captions,
      season: seasonNum,
      episode: episodeNum,
      subjectId: targetId,
    };

    if (result.streamUrl) {
      streamCache.set(cacheKey, result);
    }

    return result;
  } catch {
    return {
      streamUrl: null,
      duration: 0,
      qualityList: [],
      isHls: false,
      captions: [],
      season: seasonNum,
      episode: episodeNum,
      subjectId: targetId,
    };
  }
}
