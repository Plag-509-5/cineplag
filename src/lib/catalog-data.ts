export type ContentType = "movie" | "series" | "anime" | "drama" | "webtoon";
export type CatalogSection = "movies" | "series" | "anime" | "dramas" | "webtoons";

export interface CatalogItem {
  title: string;
  slug: string;
  image: string;
  type: ContentType;
  version: string;
  url?: string;
  year?: string;
  genres?: string[];
  latest_episode?: string | null;
  latest_chapter?: string | null;
  seasonsCount?: number;
  rating?: string;
  duration?: string;
}

export interface CatalogCategorySection {
  id: string;
  title: string;
  rawTitle?: string;
  items: CatalogItem[];
}

export interface Episode {
  episode_id: string;
  season?: string;
  number: string;
  title: string;
  url?: string;
  version?: string;
  duration?: string;
  size?: string;
}

export interface Chapter {
  chapter_id: string;
  number: string;
  title: string;
  url?: string;
}

export interface SeasonEntry {
  seasonNumber: string;
  title: string;
  slug: string;
  version?: string;
  episodesCount?: number;
  year?: string;
  image?: string;
  episodes?: Episode[];
}

export interface CastMember {
  name: string;
  role: string;
  avatar?: string;
}

export interface DubLanguage {
  id?: string | null;
  resourceId?: string | null;
  subjectId: string;
  name: string;
  displayName: string;
  type: string;
  isOriginal?: boolean;
  isFrench?: boolean;
}

export interface CatalogDetail extends CatalogItem {
  baseTitle?: string;
  synopsis: string;
  genres: string[];
  year: string;
  status?: string;
  episodes: Episode[];
  seasons?: SeasonEntry[];
  chapters: Chapter[];
  first_episode_id?: string | null;
  first_chapter_id?: string | null;
  related?: CatalogItem[];
  country?: string;
  cast?: CastMember[];
  languages?: DubLanguage[];
  originalSubjectId?: string;
  frenchSubjectId?: string;
}

export interface DownloadItem {
  id: string;
  title: string;
  subtitle: string;
  type: ContentType;
  slug: string;
  image: string;
  quality: string;
  version: string;
  size: string;
  progress: number;
  status: "downloading" | "completed" | "paused";
  downloadedAt: string;
  episodesCount?: number;
}

export const SECTION_TO_TYPE: Record<CatalogSection, ContentType> = {
  movies: "movie",
  series: "series",
  anime: "anime",
  dramas: "drama",
  webtoons: "webtoon",
};

export const TYPE_TO_SECTION: Record<ContentType, CatalogSection> = {
  movie: "movies",
  series: "series",
  anime: "anime",
  drama: "dramas",
  webtoon: "webtoons",
};

export const TYPE_LABEL: Record<ContentType, string> = {
  movie: "Film",
  series: "Série",
  anime: "Anime",
  drama: "K-Drama",
  webtoon: "Webtoon",
};

export function cleanDisplayTitle(title: string): string {
  if (!title) return "";
  return (
    title
      .replace(/\s*\[(?:Hindi|English|Tamil|Telugu|CAM|Full movie|HQ|HD)\]/gi, "")
      .replace(/\s*\[[^\]]+\]/g, "")
      .replace(/\s*(?:S\d+[-–—S\d]*|Saison\s*\d+|Season\s*\d+).*$/i, "")
      .trim() || title
  );
}

export function formatDubDisplayName(name: string): string {
  if (!name) return "Audio";
  const n = name.trim();
  if (/original/i.test(n)) return "Version Originale (VO)";
  if (/french|franç|version française/i.test(n)) return "Français (VF)";
  if (/english|anglais/i.test(n)) return "Anglais (EN)";
  if (/spanish|esla|espagnol/i.test(n)) return "Espagnol (ES)";
  if (/portuguese|ptbr|portugais/i.test(n)) return "Portugais (PT)";
  if (/hindi/i.test(n)) return "Hindi";
  if (/tamil/i.test(n)) return "Tamoul";
  if (/telugu/i.test(n)) return "Télougou";
  if (/kannada/i.test(n)) return "Kannada";
  if (/malayalam/i.test(n)) return "Malayalam";
  if (/bengali/i.test(n)) return "Bengali";
  if (/russian|russe/i.test(n)) return "Russe";
  if (/german|allemand/i.test(n)) return "Allemand";
  if (/italian|italien/i.test(n)) return "Italien";
  if (/japanese|japonais/i.test(n)) return "Japonais";
  if (/korean|coréen/i.test(n)) return "Coréen";
  if (/chinese|chinois/i.test(n)) return "Chinois";
  if (/arabic|arabe/i.test(n)) return "Arabe";
  return n.replace(/\s*dub/i, " (Doublage)").trim();
}

export function computeAccurateVersionLabel(sub: any, languages?: DubLanguage[]): string {
  const langs: any[] = languages || (Array.isArray(sub.languages) ? sub.languages : []);
  const rawTitle = String(sub.title || "").toLowerCase();
  const subtitleValue = sub.subtitles ?? sub.subtitleLanguages ?? sub.subtitle_languages ?? sub.subtitleList ?? sub.subtitle_list ?? sub.captions ?? "";
  const subtitleText = Array.isArray(subtitleValue)
    ? subtitleValue.map((entry: any) => typeof entry === "string" ? entry : entry?.name || entry?.language || entry?.lang || entry?.code || "").join(" ").toLowerCase()
    : subtitleValue && typeof subtitleValue === "object"
      ? Object.entries(subtitleValue).map(([key, value]) => `${key} ${String(value)}`).join(" ").toLowerCase()
      : String(subtitleValue).toLowerCase();
  const languageText = (language: any) => String(
    language?.name || language?.displayName || language?.language || language?.lang || language?.code || language || ""
  ).toLowerCase();
  const originalLanguage = languageText(sub.originalLanguage || sub.original_language || sub.language || sub.languageCode || sub.language_code || "");
  const isFrenchOriginal = /^(?:fr|fra|french|français|francais)(?:$|\b|[-_])/i.test(originalLanguage);
  const isSubtitleLanguage = (language: any) => /^(?:sub|subtitle|subtitles|caption|captions|cc)$/i.test(String(language?.type || ""));
  const hasFrenchDub = langs.some((language: any) =>
    /french|français|francais|version française|version francaise|^fra?(?:$|[-_])/i.test(languageText(language)) && !isSubtitleLanguage(language)
  ) || /(?:^|[^a-z])(?:vf|version française|version francaise|french dub)(?:$|[^a-z])/.test(rawTitle);
  const hasFrenchSub = /français|francais|french|vostfr|(?:^|[^a-z])fra?(?:$|[^a-z])/.test(subtitleText) || /vostfr/i.test(rawTitle) ||
    langs.some((language: any) =>
      isSubtitleLanguage(language) && /french|français|francais|^fra?(?:$|[-_])/i.test(languageText(language))
    );

  if (hasFrenchDub && hasFrenchSub) return "VF / VOSTFR";
  if (hasFrenchDub) return "VF";
  if (hasFrenchSub) return "VOSTFR";
  if (isFrenchOriginal) return "VO (FR)";
  if (langs.length > 2) return "Multi-Audio";
  if (rawTitle.includes("hindi")) return "VO (Hindi)";
  if (rawTitle.includes("english")) return "VO (EN)";
  return "VO";
}

export function cleanSectionTitle(raw: string): string {
  if (!raw) return "Sélection";
  const frenchMapping: Record<string, string> = {
    "Trending Now": "Tendances actuelles",
    "Best Asian Series": "Meilleures séries asiatiques",
    "Popular Series": "Séries populaires",
    "Popular Movie": "Films populaires",
    "Western TV": "Séries & Télévision",
    "Top Anime": "Animes incontournables",
    "Popular Movie and TV Series": "Films & Séries à ne pas manquer",
    "Cinema": "Nouveautés cinéma",
    "Action Movies": "Films d'action",
    "Horror Movies": "Films d'horreur",
    "Hollywood": "Cinéma international",
    "Bollywood": "Cinéma Bollywood",
    "South Indian": "Grands spectacles",
    "Kids Movies and Cartoons": "Jeunesse & Animation",
    "Hot Short TV": "Mini-séries & Formats courts",
    "Free Now!": "Accès direct",
    "Netflix WWE Live & Replay": "Sport & Événements",
    "Bollywood Love Stories": "Romance & Comédies romantiques",
    "One-Person Army Action": "Action & Combats",
    "Laugh Out Loud": "Comédies & Humour",
    "Fantastic Adventure Journey": "Aventure & Mondes fantastiques",
    "Super Hero": "Super-héros & Épopées",
    "Sci-Fi Future": "Science-fiction & Anticipation",
    "Dark Fantasy": "Dark Fantasy & Mystère",
    "Crime and Thriller": "Thrillers & Policiers",
    "Adventures in Time": "Aventures temporelles",
    "Soldier's Love Stories": "Drames & Histoires d'amour",
    "Feel-good Dramas": "Drames captivants",
    "Survival Game": "Jeux de survie & Suspense",
    "Hidden Love": "Romances asiatiques",
    "Anime in Progress": "Animes en cours de diffusion",
    "Animated Film": "Longs métrages d'animation",
  };

  const stripped = raw
    .replace(/[🔥✨👁️💗😀🪄🧗🏻🪐🦸🏻🔭🌏🔝🌟❤😏☠️💌👿🖱️🆕✈️❤️‍🔥👹🏫🎞️🆓👊⚔️♀️🤑🩹💒⏳]/gu, "")
    .replace(/\b(IN|PK&BG_TV TAB|movie tab_IN|TAB|IN Banner)\b/gi, "")
    .replace(/_/g, " ")
    .trim();

  return frenchMapping[stripped] || stripped || "Sélection";
}

export const EDITORIAL: CatalogItem[] = [
  {
    title: "Avatar",
    slug: "1654274595068805784",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/27/d0afc52be1b6f93d5c9a70f9105f3a37.jpg",
    version: "VF / VOSTFR",
    year: "2009",
    genres: ["Action", "Aventure", "Fantastique"],
    rating: "7.9",
    duration: "2h 42m",
  },
  {
    title: "The Boys",
    slug: "4830273202448466064",
    type: "series",
    image: "https://pbcdn.aoneroom.com/image/2026/09/15/455328c7f4249ad60b5e585049de8019.jpg",
    version: "VOSTFR",
    year: "2024",
    genres: ["Action", "Drame", "Comédie"],
    seasonsCount: 5,
    rating: "8.5",
  },
  {
    title: "Inception",
    slug: "977486567826752424",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/27/ca253305a555591c771c8122e2cfd051.jpg",
    version: "VOSTFR",
    year: "2010",
    genres: ["Action", "Science-fiction", "Thriller"],
    rating: "8.8",
    duration: "2h 28m",
  },
  {
    title: "Interstellar",
    slug: "5038022591622040232",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/27/f1aeaf2671b8b1589b5a56b40e730f1b.jpg",
    version: "VOSTFR",
    year: "2014",
    genres: ["Science-fiction", "Aventure", "Drame"],
    rating: "8.7",
    duration: "2h 49m",
  },
  {
    title: "Oppenheimer",
    slug: "1328517294355531096",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/26/35adb669c1dea2cb4658aad7f44395d5.jpg",
    version: "VOSTFR",
    year: "2023",
    genres: ["Drame", "Histoire", "Biographie"],
    rating: "8.2",
    duration: "3h 00m",
  },
  {
    title: "Solo Leveling",
    slug: "5940673723370990096",
    type: "anime",
    image: "https://pbcdn.aoneroom.com/image/2026/10/06/c0b888cd819a48df73976d673b8f2acd.jpg",
    version: "VOSTFR",
    year: "2024",
    genres: ["Action", "Fantastique", "Animation"],
    seasonsCount: 2,
    rating: "8.5",
  },
  {
    title: "Joker",
    slug: "5419522245645451312",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/26/850324eb26b7d8aded5f955be9b7d289.jpg",
    version: "VOSTFR",
    year: "2019",
    genres: ["Drame", "Thriller", "Crime"],
    rating: "8.3",
    duration: "2h 02m",
  },
  {
    title: "Stranger Things",
    slug: "3330020475752907416",
    type: "series",
    image: "https://pbcdn.aoneroom.com/image/2026/09/17/3cefb01449fe8031b1d591107d968ead.jpg",
    version: "VOSTFR",
    year: "2016",
    genres: ["Science-fiction", "Drame", "Horreur"],
    seasonsCount: 5,
    rating: "8.6",
  },
  {
    title: "Squid Game",
    slug: "973041525783496480",
    type: "drama",
    image: "https://pbcdn.aoneroom.com/image/2026/10/09/7bf2db7ccfa4292e0876156e44088db9.jpg",
    version: "VOSTFR",
    year: "2021",
    genres: ["Thriller", "Drame", "Action"],
    seasonsCount: 3,
    rating: "7.9",
  },
  {
    title: "Spider-Man",
    slug: "668783349590360080",
    type: "movie",
    image: "https://pbcdn.aoneroom.com/image/2026/01/27/d25a6822c60406254b370e2e15913f7d.jpg",
    version: "VOSTFR",
    year: "2002",
    genres: ["Action", "Aventure", "Sci-Fi"],
    rating: "7.4",
    duration: "2h 01m",
  },
  {
    title: "Reacher",
    slug: "9216356266832971496",
    type: "series",
    image: "https://pbcdn.aoneroom.com/image/2026/10/05/eb75e975052107927d9332fd618ac154.jpg",
    version: "VOSTFR",
    year: "2022",
    genres: ["Action", "Crime", "Drame"],
    seasonsCount: 4,
    rating: "8.0",
  },
  {
    title: "Peaky Blinders",
    slug: "2177665543367546408",
    type: "series",
    image: "https://pbcdn.aoneroom.com/image/2026/01/27/10295919bb6d968ca4f1d424d08391da.jpg",
    version: "VOSTFR",
    year: "2014",
    genres: ["Crime", "Drame", "Gangster"],
    seasonsCount: 6,
    rating: "8.7",
  },
];

export const WEBTOON_PREVIEW: CatalogItem[] = [
  {
    title: "One Piece",
    slug: "one-piece",
    type: "webtoon",
    image: "https://pbcdn.aoneroom.com/image/2026/09/24/bdc0a7d7be9efadf49e7f06d0599b128.jpg",
    version: "VF",
    year: "1997",
    genres: ["Aventure", "Action"],
  },
  {
    title: "Solo Leveling",
    slug: "solo-leveling",
    type: "webtoon",
    image: "https://pbcdn.aoneroom.com/image/2026/10/06/c0b888cd819a48df73976d673b8f2acd.jpg",
    version: "VF",
    year: "2018",
    genres: ["Action", "Fantastique"],
  },
  {
    title: "Jujutsu Kaisen",
    slug: "jujutsu-kaisen",
    type: "webtoon",
    image: "https://pbcdn.aoneroom.com/image/2026/01/26/bc9427603613c8c9c239a85b2bbc552b.jpg",
    version: "VF",
    year: "2018",
    genres: ["Action", "Fantastique"],
  },
];

export const ALL_DEMO_ITEMS = [...EDITORIAL, ...WEBTOON_PREVIEW];

export function fallbackDetail(type: ContentType, slug: string): CatalogDetail | null {
  const item = ALL_DEMO_ITEMS.find((entry) => entry.slug.toLowerCase() === slug.toLowerCase());
  if (!item) return null;

  return {
    ...item,
    synopsis: `Retrouvez ${item.title} en streaming haute définition sur CinéPlag.`,
    genres: item.genres || [],
    year: item.year || "",
    status: item.rating ? `★ ${item.rating}/10` : "Disponible",
    episodes: [],
    chapters: [],
    first_episode_id: null,
    first_chapter_id: null,
  };
}

export function imageUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
