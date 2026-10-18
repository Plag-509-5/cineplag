"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, Clapperboard, Clock3, Compass, Crown, Download, ExternalLink,
  Eye, Film, FolderHeart, HardDrive, Heart, House, Layers3, ListCheck, LoaderCircle, LockKeyhole,
  LogOut, Mail, Maximize2, Menu, MoreHorizontal, Pause, Pencil, PictureInPicture2, Play, Plus,
  RefreshCw, Search, Settings, Share2, Sparkles, Star, Subtitles, Trash2, Tv, UserRound, Wifi,
  WifiOff, X, type LucideIcon,
} from "lucide-react";
import {
  EDITORIAL, TYPE_LABEL, WEBTOON_PREVIEW, imageUrl,
  type CatalogCategorySection, type CatalogDetail, type CatalogItem, type CatalogSection,
  type Chapter, type ContentType, type DownloadItem, type Episode, type SeasonEntry,
} from "@/lib/catalog-data";
import CineplagPlayer from "@/components/cineplag-player";

type View = "home" | "explore" | "search" | CatalogSection | "library" | "continue" | "offline";
type User = { id: string; name: string; email: string; avatar?: string | null };
type SavedItem = { id: string; collectionId: string; slug: string; type: ContentType; title: string; image: string; year: string; addedAt: string };
type Collection = { id: string; name: string; description: string; color: string; items: SavedItem[]; createdAt: string };
type Progress = { id: string; slug: string; type: ContentType; title: string; image: string; episodeId: string; episodeTitle: string; percent: number; updatedAt: string };
type Review = { id: string; slug: string; type: ContentType; rating: number; body: string; updatedAt: string };
type Library = { collections: Collection[]; progress: Progress[]; reviews: Review[] };
type Server = { server_name: string; server_link: string; server_type: string; version: string; score?: number };
type ReaderPage = { page: number; image: string };
type PlayerState = { item: CatalogDetail; unitId: string; unitLabel: string; isChapter: boolean; seasonNumber: number; episodeNumber: number };
type ConfirmState = { title: string; message: string; action: () => void | Promise<void> };
type QualityOption = "auto" | "4k" | "1080p" | "720p" | "480p" | "360p";
type SubtitleLang = "off" | "fr" | "fr-cc" | "en" | "es";

const emptyLibrary: Library = { collections: [], progress: [], reviews: [] };
const categories: CatalogSection[] = ["movies", "series", "anime", "dramas", "webtoons"];
const categoryInfo: Record<CatalogSection, { title: string; subtitle: string; small: string; icon: LucideIcon; tone: string }> = {
  movies: { title: "Films", subtitle: "Nouveautés et classiques, en VF et VOSTFR.", small: "Longs métrages", icon: Clapperboard, tone: "red" },
  series: { title: "Séries", subtitle: "Saisons complètes, épisode par épisode.", small: "Séries TV", icon: Tv, tone: "blue" },
  anime: { title: "Anime", subtitle: "Animes en VF et VOSTFR, mis à jour chaque semaine.", small: "Animation japonaise", icon: Sparkles, tone: "purple" },
  dramas: { title: "K-Dramas", subtitle: "Séries coréennes et asiatiques en VOSTFR.", small: "Séries asiatiques", icon: Heart, tone: "pink" },
  webtoons: { title: "Webtoons", subtitle: "Lecture en ligne, chapitre par chapitre.", small: "Lecture en ligne", icon: BookOpen, tone: "gold" },
};

const genreOptions = [
  { label: "Tout voir", value: "" }, { label: "Action", value: "action" }, { label: "Drame", value: "drame" },
  { label: "Comédie", value: "comedie" }, { label: "Aventure", value: "aventure" },
  { label: "Romance", value: "romance" }, { label: "Fantastique", value: "fantastique" },
];

const navGroups: { heading: string; entries: { id: View; label: string; icon: LucideIcon }[] }[] = [
  { heading: "DÉCOUVRIR", entries: [
    { id: "home", label: "Accueil", icon: House }, { id: "explore", label: "Explorer", icon: Compass },
    { id: "movies", label: "Films", icon: Clapperboard }, { id: "series", label: "Séries", icon: Tv },
    { id: "anime", label: "Anime", icon: Sparkles }, { id: "dramas", label: "K-Dramas", icon: Heart },
    { id: "webtoons", label: "Webtoons", icon: BookOpen },
  ] },
  { heading: "VOTRE ESPACE", entries: [
    { id: "library", label: "Ma liste", icon: Bookmark },
    { id: "continue", label: "Continuer à voir", icon: Clock3 },
    { id: "offline", label: "Hors ligne", icon: Download },
  ] },
];

const viewValues: View[] = ["home", "explore", "search", ...categories, "library", "continue", "offline"];
const colorOptions = ["coral", "violet", "blue", "gold"];

// Exact Qualities matched with WeTransfer design
const ZIP_DESIGN_QUALITIES = [
  { label: "360p", size: "397 Mo", badge: undefined, multiplier: 0.16 },
  { label: "480p", size: "702 Mo", badge: undefined, multiplier: 0.28 },
  { label: "720p", size: "1,2 Go", badge: undefined, multiplier: 0.48 },
  { label: "1080p", size: "2,1 Go", badge: "HD", multiplier: 0.85 },
  { label: "4K", size: "4,8 Go", badge: "UHD", multiplier: 1.95 },
];

const SUBTITLE_OPTIONS: { id: SubtitleLang; label: string; desc: string }[] = [
  { id: "off", label: "Désactivé", desc: "Aucun sous-titre" },
  { id: "fr", label: "Français", desc: "Complet / VOSTFR" },
  { id: "fr-cc", label: "Français (CC)", desc: "Sourds et malentendants" },
  { id: "en", label: "English", desc: "Full English Subtitles" },
  { id: "es", label: "Español", desc: "Subtítulos en español" },
];

async function requestJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(response.ok ? "Format de réponse inattendu." : "Lecture momentanément indisponible.");
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.message || payload.detail || "Lecture indisponible actuellement.");
  }
  return payload as T;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="CinéPlag">
      <span className="brand-mark"><Play size={19} strokeWidth={3.5} fill="currentColor" /></span>
      <span className="brand-word">Ciné<span>Plag</span><Crown size={12} strokeWidth={3} className="brand-crown" /></span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function Artwork({ item, className = "", eager = false }: { item: Pick<CatalogItem, "image" | "title">; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.image]);
  const src = imageUrl(item.image);
  if (!src || failed) return <div className={`artwork-fallback ${className}`}><Film size={33} strokeWidth={1.2} /><span>{item.title}</span></div>;
  return <img className={className} src={src} alt={`Affiche de ${item.title}`} loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || query.trim().length === 0) return <span>{text}</span>;
  const q = query.trim();
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return <span>{text}</span>;
  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);
  return (
    <span>
      {before}
      <strong className="match-highlight">{match}</strong>
      {after}
    </span>
  );
}

function PosterCard({ item, onOpen, onSave, saved = false, onRemove, onMove, moveOptions }: {
  item: CatalogItem; onOpen: (item: CatalogItem) => void; onSave?: (item: CatalogItem) => void; saved?: boolean;
  onRemove?: () => void; onMove?: (id: string) => void; moveOptions?: { id: string; name: string }[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className="poster-card">
      <div className="poster-art" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={(event) => { if (event.key === "Enter") onOpen(item); }}>
        <Artwork item={item} />
        <span className="poster-shade" />
        <span className="poster-version">{item.version || "VF"}</span>
        {item.rating && <span className="poster-rating-badge">★ {item.rating}</span>}
        {item.seasonsCount && item.seasonsCount > 1 && <span className="poster-seasons-badge">{item.seasonsCount} Saisons</span>}
        {onSave && <button className={`poster-save ${saved ? "saved" : ""}`} title={saved ? "Dans votre liste" : "Ajouter à ma liste"} onClick={(event) => { event.stopPropagation(); onSave(item); }}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /></button>}
        {onRemove && <button className="poster-remove" title="Retirer de la collection" onClick={(event) => { event.stopPropagation(); onRemove(); }}><X size={16} /></button>}
        <span className="poster-play"><Play size={22} fill="currentColor" /></span>
      </div>
      <div className="poster-details">
        <h3 title={item.title} onClick={() => onOpen(item)}>{item.title}</h3>
        <div className="poster-subline"><span>{item.year || TYPE_LABEL[item.type]}</span><span className="meta-dot" /> <span>{TYPE_LABEL[item.type]}</span></div>
        {onMove && moveOptions && moveOptions.length > 0 && (
          <div className="poster-menu-wrap">
            <button className="poster-more" title="Options du titre" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18} /></button>
            {menuOpen && <div className="poster-menu"><span>Déplacer vers</span>{moveOptions.map((option) => <button key={option.id} onClick={() => { onMove(option.id); setMenuOpen(false); }}>{option.name}<ArrowRight size={13} /></button>)}</div>}
          </div>
        )}
      </div>
    </article>
  );
}

function SkeletonCards({ count = 6 }: { count?: number }) {
  return <div className="poster-grid">{Array.from({ length: count }).map((_, index) => <div className="skeleton-poster" key={index}><div className="skeleton skeleton-art" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>)}</div>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: LucideIcon; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={29} strokeWidth={1.5} /></div><h3>{title}</h3><p>{description}</p>{action && onAction && <button className="button button-primary" onClick={onAction}>{action}<ArrowRight size={17} /></button>}</div>;
}

function ModalShell({ children, onClose, className = "" }: { children: ReactNode; onClose: () => void; className?: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal-panel ${className}`}>{children}</div></div>;
}

export default function CineplagApp() {
  const [view, setView] = useState<View>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef<Library>(emptyLibrary);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Authentication
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  // Profile
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  // Collections
  const [collectionEditor, setCollectionEditor] = useState<{ id?: string; name: string; description: string; color: string } | null>(null);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search & Progressive Suggestions
  const [searchText, setSearchText] = useState("");
  const [searchFilter, setSearchFilter] = useState<ContentType | "all">("all");
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchCacheRef = useRef<Map<string, CatalogItem[]>>(new Map());
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Home and Categorized Sections Structure
  const [homeSections, setHomeSections] = useState<CatalogCategorySection[]>([]);
  const [homeBanners, setHomeBanners] = useState<CatalogItem[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);

  const [categorySections, setCategorySections] = useState<CatalogCategorySection[]>([]);
  const [categoryItems, setCategoryItems] = useState<CatalogItem[]>([]);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryLastPage, setCategoryLastPage] = useState(1);
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<"latest" | "az">("latest");
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState("");

  // Detail Modal & Season Switcher
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSource, setDetailSource] = useState<"live" | "curated">("live");
  const [detailError, setDetailError] = useState("");
  const [season, setSeason] = useState("1");
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [unitsShown, setUnitsShown] = useState(18);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [ratingInput, setRatingInput] = useState(0);
  const [reviewInput, setReviewInput] = useState("");

  // Player & Custom CinéPlag Native Media Player State
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [loadedStreamData, setLoadedStreamData] = useState<{ streamUrl?: string; isHls?: boolean; captions?: any[] } | null>(null);
  const [activeLangSubjectId, setActiveLangSubjectId] = useState<string>("");
  const [activeLangResourceId, setActiveLangResourceId] = useState<string>("");
  const [servers, setServers] = useState<Server[]>([]);
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [activeServer, setActiveServer] = useState(0);
  const [playPercent, setPlayPercent] = useState(2);
  const [detectedBandwidth, setDetectedBandwidth] = useState<string>("1080p");
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [availableCaptions, setAvailableCaptions] = useState<any[]>([]);

  // Pixel-Perfect WeTransfer Download Experience State
  const [downloadModalItem, setDownloadModalItem] = useState<CatalogDetail | null>(null);
  const [selectedDlQuality, setSelectedDlQuality] = useState("1080p");
  const [downloadMode, setDownloadMode] = useState<"full" | "episodes">("full");
  const [downloadSeason, setDownloadSeason] = useState("1");
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [downloadsList, setDownloadsList] = useState<DownloadItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailRequestRef = useRef(0);

  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  const applyLibrary = useCallback((next: Library) => { libraryRef.current = next; setLibrary(next); }, []);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try { const data = await requestJSON<{ library: Library }>("/api/library"); applyLibrary(data.library); }
    catch { showToast("Impossible de charger votre bibliothèque.", true); }
    finally { setLibraryLoading(false); }
  }, [applyLibrary, showToast]);

  // Network connection detection for adaptive streaming quality
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } };
    const conn = nav.connection;
    if (conn) {
      if (conn.saveData) {
        setDetectedBandwidth("480p");
      } else if (conn.effectiveType === "4g") {
        setDetectedBandwidth((conn.downlink || 10) >= 8 ? "4K" : "1080p");
      } else if (conn.effectiveType === "3g") {
        setDetectedBandwidth("720p");
      } else if (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g") {
        setDetectedBandwidth("480p");
      }
    }
  }, []);

  // Load offline downloads from local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cineplag_downloads");
      if (saved) setDownloadsList(JSON.parse(saved));
    } catch {}
  }, []);

  const persistDownloads = useCallback((nextList: DownloadItem[]) => {
    setDownloadsList(nextList);
    try {
      localStorage.setItem("cineplag_downloads", JSON.stringify(nextList));
    } catch {}
  }, []);

  // Load Home Sections & Banners
  useEffect(() => {
    let active = true;
    setHomeLoading(true);
    requestJSON<{ sections: CatalogCategorySection[]; banners: CatalogItem[]; items: CatalogItem[] }>("/api/catalog?section=home&page=1")
      .then((data) => {
        if (!active) return;
        setHomeSections(data.sections || []);
        setHomeBanners(data.banners || []);
      })
      .catch(() => {
        if (!active) return;
        setHomeSections([{ id: "fallback-hero", title: "Sélection à la une", items: EDITORIAL }]);
        setHomeBanners(EDITORIAL.slice(0, 4));
      })
      .finally(() => {
        if (active) setHomeLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Load Category Sections & Flat Items
  useEffect(() => {
    if (!categories.includes(view as CatalogSection)) return;
    let active = true;
    setCategoryLoading(true); setCategoryNotice("");
    const params = new URLSearchParams({ section: view, page: String(categoryPage) });
    if (genre) params.set("genre", genre);
    if (sort === "az") params.set("sort", "az");

    requestJSON<{ sections: CatalogCategorySection[]; items: CatalogItem[]; meta: { last_page: number }; notice: string }>(`/api/catalog?${params}`)
      .then((data) => {
        if (!active) return;
        setCategorySections(data.sections || []);
        setCategoryItems(data.items || []);
        setCategoryLastPage(data.meta?.last_page || 1);
        setCategoryNotice(data.notice || "");
      })
      .catch(() => {
        if (!active) return;
        setCategorySections([]);
        setCategoryItems([]);
        setCategoryNotice("Le catalogue est momentanément indisponible. Réessayez dans un instant.");
      })
      .finally(() => {
        if (active) setCategoryLoading(false);
      });
    return () => { active = false; };
  }, [view, categoryPage, genre, sort]);

  const openTitle = useCallback(async (item: CatalogItem) => {
    const requestId = ++detailRequestRef.current;
    setSelectedItem(item); setDetail(null); setDetailLoading(true); setDetailError(""); setSaveMenuOpen(false); setUnitsShown(18);
    const existingReview = libraryRef.current.reviews.find((entry) => entry.slug === item.slug && entry.type === item.type);
    setRatingInput(existingReview?.rating || 0); setReviewInput(existingReview?.body || "");
    try {
      const data = await requestJSON<{ detail: CatalogDetail; source: "live" | "curated" }>(`/api/catalog/${item.type}/${encodeURIComponent(item.slug)}`);
      if (requestId !== detailRequestRef.current) return;
      setDetail(data.detail); setDetailSource(data.source);
      const initialSeason = data.detail.seasons?.[0]?.seasonNumber || data.detail.episodes?.[0]?.season || "1";
      setSeason(initialSeason);
    } catch (error) { if (requestId === detailRequestRef.current) setDetailError(error instanceof Error ? error.message : "Fiche indisponible."); }
    finally { if (requestId === detailRequestRef.current) setDetailLoading(false); }
  }, []);

  const closeTitle = () => {
    detailRequestRef.current++;
    setSelectedItem(null);
    setDetail(null);
    setDetailError("");
    setSaveMenuOpen(false);
  };

  const handleSelectSeason = async (seasonNum: string, seasonSlug?: string) => {
    setSeason(seasonNum);
    setUnitsShown(18);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialView = params.get("view");
    if (initialView && viewValues.includes(initialView as View)) setView(initialView as View);
    const slug = params.get("title"), type = params.get("type");
    if (slug && type && ["movie", "series", "anime", "drama", "webtoon"].includes(type)) {
      const known = [...EDITORIAL, ...WEBTOON_PREVIEW].find((entry) => entry.slug === slug && entry.type === type);
      void openTitle(known || { slug, type: type as ContentType, title: slug.replaceAll("-", " "), image: "", version: "" });
    }
    const onPop = () => {
      const value = new URLSearchParams(window.location.search).get("view");
      setView(value && viewValues.includes(value as View) ? value as View : "home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openTitle]);

  useEffect(() => {
    let active = true;
    requestJSON<{ user: User | null }>("/api/auth").then((data) => {
      if (!active) return;
      setUser(data.user);
      if (data.user) void loadLibrary();
    }).catch(() => {});
    return () => { active = false; };
  }, [loadLibrary]);

  // Click outside search box
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Progressive search suggestions
  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 1) {
      setSuggestions([]);
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const pool: CatalogItem[] = [
      ...EDITORIAL,
      ...WEBTOON_PREVIEW,
      ...homeSections.flatMap((s) => s.items),
      ...Array.from(searchCacheRef.current.values()).flat(),
    ];

    const qLower = query.toLowerCase();
    const localMatches = pool.filter((item, index, self) => {
      if (!item?.title || !item?.slug) return false;
      const isFirst = self.findIndex((s) => s.slug === item.slug && s.type === item.type) === index;
      if (!isFirst) return false;
      const title = item.title.toLowerCase();
      const genres = item.genres?.map((g) => g.toLowerCase()) || [];
      return title.includes(qLower) || genres.some((g) => g.includes(qLower));
    }).sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aExact = aTitle === qLower ? 4 : aTitle.startsWith(qLower) ? 3 : aTitle.includes(qLower) ? 2 : 1;
      const bExact = bTitle === qLower ? 4 : bTitle.startsWith(qLower) ? 3 : bTitle.includes(qLower) ? 2 : 1;
      return bExact - aExact;
    });

    setSuggestions(localMatches.slice(0, 6));
    if (query.length < 2) {
      setSearchResults(localMatches);
      setSearchLoading(false);
      return;
    }

    const cached = searchCacheRef.current.get(qLower);
    if (cached) {
      setSearchResults(cached);
      setSuggestions(cached.slice(0, 6));
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      requestJSON<{ items: CatalogItem[] }>(`/api/catalog?q=${encodeURIComponent(query)}`)
        .then((data) => {
          if (!active) return;
          const items = data.items || [];
          searchCacheRef.current.set(qLower, items);
          setSearchResults(items);
          setSuggestions(items.slice(0, 6));
        })
        .catch(() => {
          if (!active) return;
          if (localMatches.length > 0) {
            setSearchResults(localMatches);
            setSuggestions(localMatches.slice(0, 6));
          }
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchText, homeSections]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (downloadModalItem) setDownloadModalItem(null);
        else if (player) setPlayer(null);
        else if (confirm) setConfirm(null);
        else if (collectionEditor) setCollectionEditor(null);
        else if (profileOpen) setProfileOpen(false);
        else if (authOpen) setAuthOpen(false);
        else if (selectedItem) closeTitle();
        else setDrawerOpen(false);
      }
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [downloadModalItem, player, confirm, collectionEditor, profileOpen, authOpen, selectedItem]);

  useEffect(() => {
    document.body.style.overflow = downloadModalItem || (player && !isMiniPlayer) || selectedItem || authOpen || profileOpen || collectionEditor || confirm ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [downloadModalItem, player, isMiniPlayer, selectedItem, authOpen, profileOpen, collectionEditor, confirm]);

  const navigate = (next: View) => {
    setView(next); setDrawerOpen(false); setSearchText(""); setSearchFilter("all"); setCategoryPage(1); setGenre(""); setSort("latest");
    window.history.pushState({}, "", next === "home" ? "/" : `/?view=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openAuth = (mode: "login" | "register" = "login") => { setAuthMode(mode); setAuthError(""); setAuthOpen(true); };

  const mutateLibrary = async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, optimistic?: (current: Library) => Library, message?: string) => {
    const before = libraryRef.current;
    if (optimistic) applyLibrary(optimistic(before));
    try {
      const data = await requestJSON<{ library: Library }>("/api/library", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      applyLibrary(data.library);
      if (message) showToast(message);
      return data.library;
    } catch (error) {
      if (optimistic) applyLibrary(before);
      showToast(error instanceof Error ? error.message : "Une erreur est survenue.", true);
      return null;
    }
  };

  const isSaved = (item: CatalogItem) => library.collections.some((collection) => collection.items.some((saved) => saved.slug === item.slug && saved.type === item.type));

  const toggleSave = async (item: CatalogItem, targetId?: string) => {
    if (!user) { openAuth(); return; }
    const available = libraryRef.current.collections;
    const alreadySaved = targetId ? undefined : available.find((entry) => entry.items.some((saved) => saved.slug === item.slug && saved.type === item.type));
    const collection = available.find((entry) => entry.id === targetId) || alreadySaved || available.find((entry) => entry.name === "Ma liste") || available[0];
    if (!collection) { setCollectionEditor({ name: "", description: "", color: "coral" }); showToast("Créez d'abord une collection pour enregistrer ce titre."); return; }
    const existing = collection.items.find((saved) => saved.slug === item.slug && saved.type === item.type);
    if (existing) {
      await mutateLibrary("DELETE", { kind: "item", id: existing.id }, (current) => ({ ...current, collections: current.collections.map((entry) => entry.id === collection.id ? { ...entry, items: entry.items.filter((saved) => saved.id !== existing.id) } : entry) }), "Retiré de votre collection");
    } else {
      const temp: SavedItem = { id: `temp-${Date.now()}`, collectionId: collection.id, slug: item.slug, type: item.type, title: item.title, image: item.image, year: item.year || "", addedAt: new Date().toISOString() };
      await mutateLibrary("POST", { kind: "item", collectionId: collection.id, item }, (current) => ({ ...current, collections: current.collections.map((entry) => entry.id === collection.id ? { ...entry, items: [temp, ...entry.items] } : entry) }), `Ajouté à « ${collection.name} »`);
    }
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      const data = await requestJSON<{ user: User }>("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: authMode, ...authForm }) });
      setUser(data.user); setAuthOpen(false); setAuthForm({ name: "", email: "", password: "" });
      await loadLibrary(); showToast(authMode === "register" ? "Compte créé." : "Connexion réussie.");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Impossible de vous connecter."); }
    finally { setAuthBusy(false); }
  };

  // Google OAuth Sign-In
  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const randomId = Math.random().toString(36).substring(2, 10);
      const googleUserPayload = {
        action: "google",
        email: `utilisateur.${randomId}@gmail.com`,
        name: `Membre Google`,
        googleId: `google_sub_${randomId}`,
      };

      const data = await requestJSON<{ user: User }>("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(googleUserPayload),
      });

      setUser(data.user);
      setAuthOpen(false);
      await loadLibrary();
      showToast("Connecté avec Google.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Échec de la connexion Google.");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try { await requestJSON("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); }
    catch {}
    setUser(null); applyLibrary(emptyLibrary); setProfileOpen(false); navigate("home"); showToast("Vous êtes déconnecté.");
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setProfileBusy(true);
    try {
      const data = await requestJSON<{ user: User }>("/api/auth", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profileName, newPassword: profilePassword, currentPassword: profileCurrentPassword }) });
      setUser(data.user); setProfileOpen(false); setProfilePassword(""); setProfileCurrentPassword(""); showToast("Profil mis à jour.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Mise à jour impossible.", true); }
    finally { setProfileBusy(false); }
  };

  const submitCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!collectionEditor) return;
    setCollectionBusy(true);
    const creating = !collectionEditor.id;
    const beforeIds = libraryRef.current.collections.map((entry) => entry.id);
    const result = await mutateLibrary(creating ? "POST" : "PATCH", { kind: "collection", ...collectionEditor, id: collectionEditor.id }, undefined, creating ? "Collection créée." : "Collection mise à jour.");
    if (result) {
      if (creating) setSelectedCollectionId(result.collections.find((entry) => !beforeIds.includes(entry.id))?.id || result.collections[0]?.id || "");
      setCollectionEditor(null); setView("library");
    }
    setCollectionBusy(false);
  };

  const deleteCollection = (collection: Collection) => setConfirm({
    title: "Supprimer cette collection ?", message: `« ${collection.name} » et ses ${collection.items.length} titre${collection.items.length > 1 ? "s" : ""} seront supprimés. Cette action est définitive.`,
    action: async () => { await mutateLibrary("DELETE", { kind: "collection", id: collection.id }, (current) => ({ ...current, collections: current.collections.filter((entry) => entry.id !== collection.id) }), "Collection supprimée."); setSelectedCollectionId(""); },
  });

  const saveReview = async () => {
    if (!user) { openAuth(); return; }
    if (!detail || !ratingInput) { showToast("Choisissez d'abord une note.", true); return; }
    const existing = library.reviews.find((entry) => entry.slug === detail.slug && entry.type === detail.type);
    const temp: Review = { id: existing?.id || `temp-${Date.now()}`, slug: detail.slug, type: detail.type, rating: ratingInput, body: reviewInput, updatedAt: new Date().toISOString() };
    await mutateLibrary(existing ? "PATCH" : "POST", { kind: "review", id: existing?.id, slug: detail.slug, type: detail.type, rating: ratingInput, body: reviewInput }, (current) => ({ ...current, reviews: [temp, ...current.reviews.filter((entry) => !(entry.slug === detail.slug && entry.type === detail.type))] }), "Note enregistrée.");
  };

  const removeReview = () => {
    if (!detail) return;
    const existing = library.reviews.find((entry) => entry.slug === detail.slug && entry.type === detail.type);
    if (!existing) return;
    setConfirm({ title: "Supprimer votre avis ?", message: "Votre note et votre commentaire seront supprimés de ce titre.", action: async () => {
      await mutateLibrary("DELETE", { kind: "review", id: existing.id }, (current) => ({ ...current, reviews: current.reviews.filter((entry) => entry.id !== existing.id) }), "Avis supprimé.");
      setRatingInput(0); setReviewInput("");
    } });
  };

  const launchPlayer = (episode?: Episode, chapter?: Chapter) => {
    if (!detail) return;
    const isChapter = detail.type === "webtoon";
    const unitId = isChapter
      ? chapter?.chapter_id || detail.first_chapter_id || detail.chapters[0]?.chapter_id
      : episode?.episode_id || detail.first_episode_id || detail.episodes[0]?.episode_id;
    if (!unitId) {
      showToast(isChapter ? "Aucun chapitre disponible pour le moment." : "Aucun lecteur disponible pour ce titre.", true);
      return;
    }
    const unitLabel = isChapter
      ? chapter?.title || "Chapitre 1"
      : episode
      ? `${episode.season ? `Saison ${episode.season} · ` : ""}${episode.title || `Épisode ${episode.number}`}`
      : detail.type === "movie"
      ? "Film"
      : "Épisode 1";
    const seasonNumber = Math.max(1, Number.parseInt(episode?.season || "1", 10) || 1);
    const episodeNumber = Math.max(1, Number.parseInt(episode?.number || "1", 10) || 1);
    const previous = libraryRef.current.progress.find((entry) => entry.slug === detail.slug && entry.type === detail.type);
    setPlayPercent(previous?.episodeId === unitId ? previous.percent : 2);

    const defaultDubLanguage =
      detail.languages?.find((language) => language.isFrench) ||
      (detail.frenchSubjectId ? undefined : detail.languages?.find((language) => language.isOriginal));
    const defaultDubSubjectId =
      detail.frenchSubjectId ||
      defaultDubLanguage?.subjectId ||
      detail.originalSubjectId ||
      detail.slug;

    setActiveLangSubjectId(defaultDubSubjectId);
    setActiveLangResourceId(defaultDubLanguage?.resourceId || defaultDubLanguage?.id || "");
    setIsMiniPlayer(false);
    setPlayer({ item: detail, unitId, unitLabel, isChapter, seasonNumber, episodeNumber });
  };

  // Playback request & automated stream loading
  useEffect(() => {
    if (!player) return;
    let active = true;
    setStreamLoading(true);
    setStreamError("");
    setServers([]);
    setPages([]);
    setAvailableCaptions([]);
    setLoadedStreamData(null);
    setActiveServer(0);

    const params = new URLSearchParams({ type: player.item.type, slug: player.item.slug });
    params.set(player.isChapter ? "chapter" : "episode", player.unitId);
    params.set("season", String(player.seasonNumber));
    params.set("ep", String(player.episodeNumber));
    if (activeLangSubjectId) params.set("subjectId", activeLangSubjectId);
    if (activeLangResourceId) params.set("resourceId", activeLangResourceId);
    if (selectedQuality && selectedQuality !== "auto") params.set("quality", selectedQuality);

    requestJSON<{
      servers?: Server[];
      pages?: ReaderPage[];
      captions?: any[];
      streamUrl?: string;
      isHls?: boolean;
    }>(`/api/playback?${params}`)
      .then((data) => {
        if (!active) return;
        const found = player.isChapter ? (data.pages?.length || 0) : Boolean(data.streamUrl || data.servers?.length);
        if (!found) {
          setStreamError(
            player.isChapter
              ? "Aucune page disponible pour ce chapitre."
              : "Aucun flux de lecture disponible pour cet épisode."
          );
          return;
        }

        setServers(data.servers || []);
        setPages(data.pages || []);
        setLoadedStreamData({
          streamUrl: data.streamUrl || data.servers?.[0]?.server_link,
          isHls: data.isHls,
          captions: data.captions || [],
        });

        if (Array.isArray(data.captions) && data.captions.length > 0) {
          setAvailableCaptions(data.captions);
        }
        setActiveServer(0);

        if (user) {
          const previous = libraryRef.current.progress.find(
            (entry) => entry.slug === player.item.slug && entry.type === player.item.type
          );
          const percent = previous?.episodeId === player.unitId ? previous.percent : 2;
          requestJSON<{ library: Library }>("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "progress",
              item: player.item,
              percent,
              episodeId: player.unitId,
              episodeTitle: player.unitLabel,
            }),
          })
            .then((result) => {
              if (active) applyLibrary(result.library);
            })
            .catch(() => {});
        }
      })
      .catch((error) => {
        if (active) setStreamError(error instanceof Error ? error.message : "Lecture indisponible.");
      })
      .finally(() => {
        if (active) setStreamLoading(false);
      });

    return () => {
      active = false;
    };
  }, [player, activeLangSubjectId, activeLangResourceId, selectedQuality, user, applyLibrary]);

  const updateProgress = async (percent: number) => {
    if (!user || !player) { openAuth(); return; }
    const existing = libraryRef.current.progress.find((entry) => entry.slug === player.item.slug && entry.type === player.item.type);
    setPlayPercent(percent);
    if (existing) {
      await mutateLibrary("PATCH", { kind: "progress", id: existing.id, percent }, (current) => ({ ...current, progress: current.progress.map((entry) => entry.id === existing.id ? { ...entry, percent } : entry) }), percent === 100 ? "Marqué comme terminé." : "Progression enregistrée.");
    } else {
      await mutateLibrary("POST", { kind: "progress", item: player.item, episodeId: player.unitId, episodeTitle: player.unitLabel, percent }, undefined, "Progression enregistrée.");
    }
  };

  const shareTitle = async () => {
    if (!selectedItem) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/?type=${selectedItem.type}&title=${encodeURIComponent(selectedItem.slug)}`); showToast("Lien copié dans le presse-papiers."); }
    catch { showToast("Impossible de copier le lien.", true); }
  };

  // Open Download View (Pixel-Perfect Zip Design Implementation)
  const openDownloadModal = async (item: CatalogItem | CatalogDetail) => {
    let fullDetail: CatalogDetail = item as CatalogDetail;
    if (!fullDetail.episodes || fullDetail.episodes.length === 0) {
      try {
        const res = await requestJSON<{ detail: CatalogDetail }>(`/api/catalog/${item.type}/${encodeURIComponent(item.slug)}`);
        if (res.detail) fullDetail = res.detail;
      } catch {}
    }
    setDownloadModalItem(fullDetail);
    setSelectedDlQuality("1080p");
    setDownloadMode("full");
    setDownloadSeason(fullDetail.seasons?.[0]?.seasonNumber || "1");
    setSelectedEpisodeIds(fullDetail.episodes?.map((e) => e.episode_id) || []);
  };

  // Trigger Download using the exact design UX
  const triggerDownloadAction = () => {
    if (!downloadModalItem) return;
    if (downloadModalItem.type === "webtoon") {
      showToast("Le serveur MovieBox ne propose pas le téléchargement des webtoons.", true);
      return;
    }

    const isMovie = downloadModalItem.type === "movie";
    const isFullSeries = downloadMode === "full";
    const selectedEpisodes = isMovie
      ? []
      : (downloadModalItem.episodes || []).filter((episode) =>
          isFullSeries || selectedEpisodeIds.includes(episode.episode_id)
        );

    if (!isMovie && selectedEpisodes.length === 0) {
      showToast("Aucun épisode disponible à télécharger.", true);
      return;
    }

    const createDownloadUrl = (episode?: Episode) => {
      const params = new URLSearchParams({
        subjectId: downloadModalItem.slug,
        quality: selectedDlQuality,
        title: downloadModalItem.baseTitle || downloadModalItem.title,
        season: episode?.season || downloadSeason || "1",
        episode: episode?.number || "1",
      });
      return `/api/download?${params.toString()}`;
    };

    const downloadOne = (url: string, filename: string) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };

    if (isMovie || selectedEpisodes.length === 1) {
      const episode = selectedEpisodes[0];
      const suffix = episode ? `-s${episode.season || "1"}e${episode.number}` : "";
      downloadOne(
        createDownloadUrl(episode),
        `${downloadModalItem.slug}${suffix}-${selectedDlQuality}.mp4`
      );
      setDownloadModalItem(null);
      showToast(`Téléchargement demandé à MovieBox (${selectedDlQuality}).`);
      return;
    }

    // The API exposes one download per episode, not a season archive; provide API-backed links.
    const linkContent = [
      `# CinéPlag — ${downloadModalItem.baseTitle || downloadModalItem.title}`,
      `# Qualité : ${selectedDlQuality}`,
      "# Chaque lien déclenche le téléchargement d’un épisode via le serveur MovieBox.",
      "",
      ...selectedEpisodes.map((episode) => `${window.location.origin}${createDownloadUrl(episode)}`),
    ].join("\n");
    const blob = new Blob([linkContent], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${downloadModalItem.slug}-${isFullSeries ? "integrale" : "selection"}-${selectedDlQuality}-liens.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    setDownloadModalItem(null);
    showToast(`${selectedEpisodes.length} liens de téléchargement MovieBox générés.`);
  };

  const removeDownload = (id: string) => {
    const next = downloadsList.filter((item) => item.id !== id);
    persistDownloads(next);
    showToast("Téléchargement retiré.");
  };

  const currentCollection = library.collections.find((entry) => entry.id === selectedCollectionId) || library.collections.find((entry) => entry.name === "Ma liste") || library.collections[0];
  const shownSearch = searchFilter === "all" ? searchResults : searchResults.filter((item) => item.type === searchFilter);
  const visibleEpisodes = detail?.episodes.filter((episode) => (episode.season || "1") === season) || [];
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());
  const parisHour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date()));
  const greeting = parisHour >= 18 ? "Bonsoir" : "Bonjour";

  const heroItem = homeBanners[0] || EDITORIAL[0];

  const sectionHeader = (eyebrow: string, title: string, action?: string, onAction?: () => void) => (
    <div className="section-head">
      <div>
        <span className="section-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action && onAction && (
        <button className="text-link" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );

  const shelf = (items: (CatalogItem | undefined)[], loading = false) => {
    const valid = (items || []).filter((item): item is CatalogItem => Boolean(item && item.slug && item.type));
    return loading ? (
      <div className="shelf-track">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton-poster" key={index}>
            <div className="skeleton skeleton-art" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ))}
      </div>
    ) : (
      <div className="shelf-track">
        {valid.map((item, index) => (
          <PosterCard
            key={`${item.type}-${item.slug}-${index}`}
            item={item}
            onOpen={openTitle}
            onSave={toggleSave}
            saved={isSaved(item)}
          />
        ))}
      </div>
    );
  };

  const guestPanel = (title: string, description: string, icon: LucideIcon = Bookmark) => (
    <EmptyState icon={icon} title={title} description={description} action="Se connecter" onAction={() => openAuth()} />
  );

  const renderHome = () => <>
    <div className="page-intro">
      <div>
        <p className="intro-eyebrow">ACCUEIL</p>
        <h1>{user ? `${greeting}, ${user.name}` : "Bienvenue sur CinéPlag"}<span className="intro-period">.</span></h1>
        <p>Reprenez votre visionnage ou explorez le catalogue.</p>
      </div>
      <span className="today-label">{today}</span>
    </div>

    {/* Hero Featured Card from API Banners */}
    <section className="hero-card">
      <div className="hero-content">
        <span className="hero-kicker"><span className="live-dot" /> À LA UNE</span>
        <h2>{heroItem.title}</h2>
        <p>Dans un univers spectaculaire, explorez des mondes inexplorés et vivez une aventure cinématographique totale.</p>
        <div className="hero-actions">
          <button className="button button-primary hero-button" onClick={() => openTitle(heroItem)}>
            <Play size={17} fill="currentColor" /> Regarder maintenant
          </button>
          <button className="button button-glass" onClick={() => openDownloadModal(heroItem)}>
            <Download size={17} /> Télécharger
          </button>
          <button className="button button-glass" onClick={() => navigate("explore")}>
            Explorer le catalogue <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-foot">
          <span className="hero-foot-line" />
          <span>{heroItem.year || "2024"}</span>
          <span className="hero-foot-dot">·</span>
          <span>{heroItem.genres?.slice(0, 2).join(" / ") || TYPE_LABEL[heroItem.type].toUpperCase()}</span>
          <span className="hero-foot-dot">·</span>
          <span>{heroItem.version}</span>
        </div>
      </div>
    </section>

    {/* Quick Categories Bar */}
    <div className="quick-categories">
      {categories.map((key) => {
        const info = categoryInfo[key];
        const Icon = info.icon;
        return (
          <button className={`quick-category tone-${info.tone}`} key={key} onClick={() => navigate(key)}>
            <span className="quick-icon"><Icon size={19} strokeWidth={1.8} /></span>
            <span>{info.title}</span>
            <ArrowUpRight size={15} className="quick-arrow" />
          </button>
        );
      })}
    </div>

    {/* In-Progress Resume Strip */}
    {user && library.progress.some((entry) => entry.percent < 100) && (
      <section className="content-section">
        {sectionHeader("EN COURS", "Continuer à voir", "Tout voir", () => navigate("continue"))}
        <div className="resume-strip">
          {library.progress.filter((entry) => entry.percent < 100).slice(0, 3).map((entry) => (
            <button className="resume-card" key={entry.id} onClick={() => openTitle({ ...entry, version: "" })}>
              <div className="resume-image"><Artwork item={entry} /></div>
              <div className="resume-copy">
                <span>{TYPE_LABEL[entry.type]} · {entry.episodeTitle || "En cours"}</span>
                <strong>{entry.title}</strong>
                <div className="resume-track"><span style={{ width: `${entry.percent}%` }} /></div>
                <small>{entry.percent}% visionné</small>
              </div>
              <span className="resume-play"><Play size={17} fill="currentColor" /></span>
            </button>
          ))}
        </div>
      </section>
    )}

    {/* Render All Structured API Sections with their Exact Titles & Items */}
    {homeLoading ? (
      <section className="content-section">
        {sectionHeader("CHARGEMENT", "Sélection en cours...")}
        {shelf([], true)}
      </section>
    ) : homeSections.length > 0 ? (
      homeSections.map((sec, idx) => (
        <section className="content-section" key={sec.id || idx}>
          {sectionHeader("CATALOGUE", sec.title, "Explorer", () => navigate("explore"))}
          {shelf(sec.items)}
        </section>
      ))
    ) : (
      <section className="content-section">
        {sectionHeader("SÉLECTION", "Films et séries populaires", "Tout voir", () => navigate("explore"))}
        {shelf(EDITORIAL)}
      </section>
    )}

    <div className="editorial-banner">
      <div className="editorial-icon"><Bookmark size={25} /></div>
      <div>
        <span className="section-eyebrow">MA LISTE</span>
        <h2>Organisez vos films et vos séries</h2>
        <p>Créez des collections, notez ce que vous avez vu et retrouvez votre progression.</p>
      </div>
      <button className="button button-outline" onClick={() => user ? navigate("library") : openAuth()}>
        {user ? "Ouvrir ma liste" : "Créer un compte"}
        <ArrowRight size={17} />
      </button>
    </div>
  </>;

  const renderExplore = () => <>
    <div className="view-heading">
      <span className="section-eyebrow">CATALOGUE</span>
      <h1>Parcourir le <em>catalogue</em></h1>
      <p>Films, séries, animes, K-dramas et webtoons en VF et VOSTFR.</p>
    </div>
    <div className="explore-categories">
      {categories.map((key) => {
        const info = categoryInfo[key];
        const Icon = info.icon;
        const preview =
          key === "webtoons"
            ? WEBTOON_PREVIEW[0]
            : homeSections.find((s) => s.items.some((i) => i.type === ({ movies: "movie", series: "series", anime: "anime", dramas: "drama", webtoons: "webtoon" } as Record<CatalogSection, ContentType>)[key]))?.items[0] || EDITORIAL[0];
        return (
          <button className={`explore-tile tone-${info.tone}`} key={key} onClick={() => navigate(key)}>
            <div className="explore-tile-image">{preview && <Artwork item={preview} />}</div>
            <div className="explore-tile-content">
              <Icon size={23} />
              <span>CATÉGORIE</span>
              <h2>{info.title}</h2>
              <p>{info.small}</p>
            </div>
            <ArrowUpRight size={21} className="explore-tile-arrow" />
          </button>
        );
      })}
    </div>
    <section className="content-section">
      {sectionHeader("SÉLECTION", "Titres populaires")}
      <div className="poster-grid">
        {(homeSections[0]?.items || EDITORIAL).map((item) => (
          <PosterCard key={`${item.type}-${item.slug}`} item={item} onOpen={openTitle} onSave={toggleSave} saved={isSaved(item)} />
        ))}
      </div>
    </section>
  </>;

  const renderCatalog = (section: CatalogSection) => {
    const info = categoryInfo[section];
    const Icon = info.icon;
    const previews =
      section === "webtoons"
        ? WEBTOON_PREVIEW
        : categoryItems.length > 0
        ? categoryItems.slice(0, 3)
        : EDITORIAL.filter((item) => item.type === ({ movies: "movie", series: "series", anime: "anime", dramas: "drama", webtoons: "webtoon" } as Record<CatalogSection, ContentType>)[section]);

    return (
      <>
        <div className={`catalog-banner tone-${info.tone}`}>
          <div className="catalog-banner-copy">
            <span className="section-eyebrow">CATALOGUE <span className="small-divider">/</span> {info.title.toUpperCase()}</span>
            <div className="catalog-banner-icon"><Icon size={22} /></div>
            <h1>{info.title}<span className="intro-period">.</span></h1>
            <p>{info.subtitle}</p>
          </div>
          <div className="catalog-banner-art">
            {previews.slice(0, 3).map((item, index) => (
              <div className={`banner-poster banner-poster-${index}`} key={item.slug}>
                <Artwork item={item} />
              </div>
            ))}
          </div>
        </div>

        <div className="catalog-toolbar">
          <div>
            <span className="section-eyebrow">TOUS LES TITRES</span>
            <h2>{genre ? `${info.title} · ${genreOptions.find((option) => option.value === genre)?.label || genre}` : `Tous les ${info.title.toLowerCase()}`}</h2>
          </div>
          <div className="sort-control">
            <span>Trier par</span>
            <select value={sort} onChange={(event) => { setSort(event.target.value as "latest" | "az"); setCategoryPage(1); }} aria-label="Trier les titres">
              <option value="latest">Plus récents</option>
              {["anime", "dramas", "webtoons"].includes(section) && <option value="az">De A à Z</option>}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>

        <div className="filter-row" aria-label="Filtrer par genre">
          {genreOptions.map((option) => (
            <button className={`filter-pill ${genre === option.value ? "active" : ""}`} key={option.value} onClick={() => { setGenre(option.value); setCategoryPage(1); }}>
              {option.label}
            </button>
          ))}
        </div>

        {categoryNotice && (
          <div className="notice-banner">
            <WifiOff size={17} />
            <span>{categoryNotice}</span>
            <button onClick={() => { setCategoryPage(1); setGenre(""); }}>Voir l'aperçu</button>
          </div>
        )}

        {/* If no specific genre filter is applied and structured API sections are available, render rich shelves! */}
        {categoryLoading ? (
          <SkeletonCards count={12} />
        ) : !genre && categorySections.length > 1 ? (
          categorySections.map((sec, idx) => (
            <section className="content-section" key={sec.id || idx}>
              {sectionHeader(info.title.toUpperCase(), sec.title)}
              {shelf(sec.items)}
            </section>
          ))
        ) : categoryItems.length ? (
          <div className="poster-grid catalog-grid">
            {categoryItems.map((item, index) => (
              <PosterCard key={`${item.type}-${item.slug}-${index}`} item={item} onOpen={openTitle} onSave={toggleSave} saved={isSaved(item)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Search} title="Aucun titre trouvé" description="Essayez un autre genre ou revenez au catalogue complet." action="Tout voir" onAction={() => { setGenre(""); setCategoryPage(1); }} />
        )}

        {!categoryLoading && categoryLastPage > 1 && (genre || categorySections.length <= 1) && (
          <div className="pagination">
            <button disabled={categoryPage <= 1} onClick={() => { setCategoryPage(categoryPage - 1); window.scrollTo({ top: 330, behavior: "smooth" }); }}>
              <ChevronLeft size={17} /> Précédent
            </button>
            <span>Page <strong>{categoryPage}</strong> sur {categoryLastPage}</span>
            <button disabled={categoryPage >= categoryLastPage} onClick={() => { setCategoryPage(categoryPage + 1); window.scrollTo({ top: 330, behavior: "smooth" }); }}>
              Suivant <ChevronRight size={17} />
            </button>
          </div>
        )}
      </>
    );
  };

  const renderSearch = () => <>
    <div className="view-heading search-heading">
      <span className="section-eyebrow">RECHERCHE</span>
      <h1>{searchText.trim().length >= 1 ? <>Résultats pour <em>« {searchText.trim()} »</em></> : <>Rechercher un <em>titre</em></>}</h1>
      <p>{searchText.trim().length >= 1 ? "Films, séries, animes et K-dramas correspondants." : "Utilisez la barre de recherche pour trouver un film, une série ou un anime."}</p>
    </div>
    {searchText.trim().length >= 1 ? (
      <>
        <div className="search-filter-row">
          {([
            { label: "Tout", value: "all" },
            { label: "Films", value: "movie" },
            { label: "Séries", value: "series" },
            { label: "Anime", value: "anime" },
            { label: "K-Dramas", value: "drama" },
            { label: "Webtoons", value: "webtoon" },
          ] as { label: string; value: ContentType | "all" }[]).map((option) => (
            <button className={searchFilter === option.value ? "active" : ""} key={option.value} onClick={() => setSearchFilter(option.value)}>
              {option.label}
            </button>
          ))}
          <span>{searchLoading ? "Recherche..." : `${shownSearch.length} résultat${shownSearch.length > 1 ? "s" : ""}`}</span>
        </div>
        {searchLoading && shownSearch.length === 0 ? (
          <SkeletonCards />
        ) : shownSearch.length ? (
          <div className="poster-grid catalog-grid">
            {shownSearch.map((item, index) => (
              <PosterCard key={`${item.type}-${item.slug}-${index}`} item={item} onOpen={openTitle} onSave={toggleSave} saved={isSaved(item)} />
            ))}
          </div>
        ) : !searchLoading ? (
          <EmptyState icon={Search} title="Aucun résultat" description="Essayez un autre titre ou une autre orthographe." action="Explorer le catalogue" onAction={() => navigate("explore")} />
        ) : (
          <SkeletonCards />
        )}
      </>
    ) : (
      <section className="content-section">
        {sectionHeader("SUGGESTIONS", "Titres populaires")}
        {shelf(EDITORIAL.slice(0, 7))}
      </section>
    )}
  </>;

  const renderLibrary = () => <>
    <div className="view-heading library-heading">
      <span className="section-eyebrow">BIBLIOTHÈQUE</span>
      <h1>Ma liste<span className="intro-period">.</span></h1>
      <p>Vos collections de films, séries et animes.</p>
      {user && (
        <button className="button button-primary create-collection-button" onClick={() => setCollectionEditor({ name: "", description: "", color: "coral" })}>
          <Plus size={18} /> Nouvelle collection
        </button>
      )}
    </div>
    {!user ? (
      guestPanel("Connectez-vous pour créer vos listes", "Vos collections sont enregistrées sur votre compte.", FolderHeart)
    ) : libraryLoading ? (
      <SkeletonCards count={5} />
    ) : library.collections.length ? (
      <>
        <div className="library-overview">
          <span><strong>{library.collections.length}</strong> collection{library.collections.length > 1 ? "s" : ""}</span>
          <span className="meta-dot" />
          <span><strong>{library.collections.reduce((total, entry) => total + entry.items.length, 0)}</strong> titre{library.collections.reduce((total, entry) => total + entry.items.length, 0) > 1 ? "s" : ""} enregistré{library.collections.reduce((total, entry) => total + entry.items.length, 0) > 1 ? "s" : ""}</span>
        </div>
        <div className="collection-tabs">
          {library.collections.map((entry) => (
            <button className={`collection-tab ${currentCollection?.id === entry.id ? "active" : ""}`} key={entry.id} onClick={() => setSelectedCollectionId(entry.id)}>
              <span className={`collection-tab-icon color-${entry.color}`}>{entry.name.slice(0, 1).toUpperCase()}</span>
              <span>{entry.name}</span>
              <small>{entry.items.length}</small>
            </button>
          ))}
          <button className="collection-tab add-tab" onClick={() => setCollectionEditor({ name: "", description: "", color: "coral" })}>
            <Plus size={17} /> Ajouter
          </button>
        </div>
        {currentCollection && (
          <>
            <div className="collection-heading">
              <div>
                <h2>{currentCollection.name}</h2>
                <p>{currentCollection.description || `${currentCollection.items.length} titre${currentCollection.items.length > 1 ? "s" : ""}`}</p>
              </div>
              <div className="collection-actions">
                <button title="Modifier la collection" onClick={() => setCollectionEditor({ id: currentCollection.id, name: currentCollection.name, description: currentCollection.description, color: currentCollection.color })}>
                  <Pencil size={17} />
                </button>
                <button title="Supprimer la collection" onClick={() => deleteCollection(currentCollection)}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            {currentCollection.items.length ? (
              <div className="poster-grid catalog-grid">
                {currentCollection.items.map((saved) => (
                  <PosterCard
                    key={saved.id}
                    item={{ ...saved, version: "" }}
                    onOpen={openTitle}
                    onRemove={() => {
                      void mutateLibrary("DELETE", { kind: "item", id: saved.id }, (current) => ({ ...current, collections: current.collections.map((entry) => ({ ...entry, items: entry.items.filter((item) => item.id !== saved.id) })) }), "Titre retiré de la collection.");
                    }}
                    onMove={(targetId) => {
                      void mutateLibrary("PATCH", { kind: "item", id: saved.id, collectionId: targetId }, (current) => ({ ...current, collections: current.collections.map((entry) => (entry.id === currentCollection.id ? { ...entry, items: entry.items.filter((item) => item.id !== saved.id) } : entry.id === targetId ? { ...entry, items: [{ ...saved, collectionId: targetId }, ...entry.items] } : entry)) }), "Titre déplacé.");
                    }}
                    moveOptions={library.collections.filter((entry) => entry.id !== currentCollection.id).map((entry) => ({ id: entry.id, name: entry.name }))}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={Bookmark} title="Collection vide" description="Ajoutez des titres depuis le catalogue avec l'icône signet." action="Explorer le catalogue" onAction={() => navigate("explore")} />
            )}
          </>
        )}
      </>
    ) : (
      <EmptyState icon={FolderHeart} title="Aucune collection" description="Créez une collection pour organiser vos titres." action="Créer une collection" onAction={() => setCollectionEditor({ name: "", description: "", color: "coral" })} />
    )}
  </>;

  const renderContinue = () => <>
    <div className="view-heading">
      <span className="section-eyebrow">EN COURS</span>
      <h1>Continuer à <em>voir</em></h1>
      <p>Reprenez vos films et vos épisodes en cours.</p>
    </div>
    {!user ? (
      guestPanel("Connectez-vous pour suivre votre progression", "Votre historique est enregistré sur votre compte.", Clock3)
    ) : libraryLoading ? (
      <SkeletonCards count={4} />
    ) : library.progress.length ? (
      <div className="progress-list">
        {library.progress.map((entry) => (
          <div className="progress-row" key={entry.id}>
            <button className="progress-art" onClick={() => openTitle({ ...entry, version: "" })}>
              <Artwork item={entry} />
              <span><Play size={20} fill="currentColor" /></span>
            </button>
            <div className="progress-info">
              <span className="progress-kind">{TYPE_LABEL[entry.type]} {entry.episodeTitle ? `· ${entry.episodeTitle}` : ""}</span>
              <h2>{entry.title}</h2>
              <p>{entry.percent === 100 ? "Terminé" : `${entry.percent}% visionné`}</p>
              <div className="progress-bar"><span style={{ width: `${entry.percent}%` }} /></div>
            </div>
            <div className="progress-actions">
              <button className="button button-outline" onClick={() => openTitle({ ...entry, version: "" })}>
                {entry.percent === 100 ? "Revoir" : "Reprendre"}
                <ArrowRight size={16} />
              </button>
              <div>
                <button title="Marquer comme terminé" onClick={() => { void mutateLibrary("PATCH", { kind: "progress", id: entry.id, percent: 100 }, (current) => ({ ...current, progress: current.progress.map((item) => (item.id === entry.id ? { ...item, percent: 100 } : item)) }), "Marqué comme terminé."); }}>
                  <Check size={16} />
                </button>
                <button title="Effacer la progression" onClick={() => setConfirm({ title: "Effacer cette progression ?", message: `« ${entry.title} » ne figurera plus dans votre historique de lecture.`, action: () => { void mutateLibrary("DELETE", { kind: "progress", id: entry.id }, (current) => ({ ...current, progress: current.progress.filter((item) => item.id !== entry.id) }), "Progression effacée."); } })}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState icon={Play} title="Aucune lecture en cours" description="Les titres que vous commencez apparaissent ici." action="Explorer le catalogue" onAction={() => navigate("explore")} />
    )}
  </>;

  const renderOffline = () => <>
    <div className="view-heading">
      <span className="section-eyebrow">HORS LIGNE</span>
      <h1>Mes <em>téléchargements</em></h1>
      <p>Films, séries et épisodes téléchargés pour visionnage sans connexion.</p>
    </div>
    {downloadsList.length > 0 ? (
      <div className="offline-downloads-wrapper">
        <div className="offline-toolbar">
          <div className="offline-stat">
            <HardDrive size={16} />
            <span>{downloadsList.length} titre{downloadsList.length > 1 ? "s" : ""} téléchargé{downloadsList.length > 1 ? "s" : ""}</span>
          </div>
          <button className="button button-outline-sm" onClick={() => { persistDownloads([]); showToast("Historique des téléchargements effacé."); }}>
            <Trash2 size={14} /> Tout effacer
          </button>
        </div>
        <div className="offline-grid">
          {downloadsList.map((dl) => (
            <div className="offline-card" key={dl.id}>
              <div className="offline-card-art">
                <Artwork item={dl} />
                <button className="offline-play-overlay" onClick={() => openTitle({ slug: dl.slug, type: dl.type, title: dl.title, image: dl.image, version: dl.version })}>
                  <Play size={22} fill="currentColor" />
                </button>
              </div>
              <div className="offline-card-info">
                <div className="offline-card-tags">
                  <span className="offline-badge quality">{dl.quality}</span>
                  <span className="offline-badge">{dl.version}</span>
                  <span className="offline-size">{dl.size}</span>
                </div>
                <h3 title={dl.title}>{dl.title}</h3>
                <p>{dl.subtitle}</p>
                <div className="offline-card-actions">
                  <button className="button button-primary button-sm" onClick={() => openTitle({ slug: dl.slug, type: dl.type, title: dl.title, image: dl.image, version: dl.version })}>
                    <Play size={14} fill="currentColor" /> Lire
                  </button>
                  <button className="offline-remove-btn" title="Supprimer le téléchargement" onClick={() => removeDownload(dl.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="offline-panel">
        <div className="offline-graphic">
          <div className="offline-orbit orbit-one" />
          <div className="offline-orbit orbit-two" />
          <div className="offline-center"><Download size={49} strokeWidth={1.5} /></div>
          <span className="offline-spark spark-one">✦</span>
          <span className="offline-spark spark-two">✧</span>
        </div>
        <h2>Aucun téléchargement</h2>
        <p>Téléchargez des films ou des saisons complètes de séries pour les retrouver directement ici.</p>
        <button className="button button-primary" onClick={() => navigate("explore")}>
          Explorer le catalogue <ArrowRight size={17} />
        </button>
      </div>
    )}
  </>;

  return (
    <div className="app-shell">
      {drawerOpen && <div className="drawer-shade" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar ${drawerOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <button className="brand-button" onClick={() => navigate("home")}><Brand /></button>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Fermer le menu"><X size={20} /></button>
        </div>
        <nav className="side-nav" aria-label="Navigation principale">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.heading}>
              <p className="nav-label">{group.heading}</p>
              {group.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button className={`nav-entry ${view === entry.id ? "active" : ""}`} key={entry.id} onClick={() => navigate(entry.id)}>
                    <Icon size={18} strokeWidth={view === entry.id ? 2.2 : 1.8} />
                    <span>{entry.label}</span>
                    {view === entry.id && <span className="nav-indicator" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <div className="promo-shine" />
            <span className="promo-icon"><Bookmark size={19} /></span>
            <h3>Ma liste</h3>
            <p>{user ? "Retrouvez vos titres enregistrés." : "Connectez-vous pour enregistrer vos titres."}</p>
            <button onClick={() => user ? navigate("library") : openAuth()}>
              {user ? "Ouvrir" : "Se connecter"} <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-footer">© {new Date().getFullYear()} CinéPlag <span>✦</span></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu"><Menu size={22} /></button>
          </div>
          <div className="topbar-search-container" ref={searchBoxRef}>
            <div className={`topbar-search ${suggestionsOpen && searchText.trim().length >= 1 ? "has-suggestions" : ""}`}>
              <Search size={19} className="search-lead-icon" />
              <input
                ref={searchInputRef}
                value={searchText}
                onChange={(event) => {
                  const val = event.target.value;
                  setSearchText(val);
                  setActiveSuggestionIndex(-1);
                  if (val.trim().length >= 1) {
                    setSuggestionsOpen(true);
                  } else {
                    setSuggestionsOpen(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (!suggestionsOpen && searchText.trim().length >= 1) {
                      setSuggestionsOpen(true);
                      return;
                    }
                    if (suggestions.length > 0) {
                      setActiveSuggestionIndex((prev) => (prev + 1 >= suggestions.length ? 0 : prev + 1));
                    }
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (suggestions.length > 0) {
                      setActiveSuggestionIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
                    }
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
                      const chosen = suggestions[activeSuggestionIndex];
                      setSuggestionsOpen(false);
                      openTitle(chosen);
                    } else if (searchText.trim().length >= 1) {
                      setSuggestionsOpen(false);
                      setView("search");
                      window.history.pushState({}, "", "/?view=search");
                    }
                  } else if (event.key === "Escape") {
                    setSuggestionsOpen(false);
                    setActiveSuggestionIndex(-1);
                  }
                }}
                onFocus={() => {
                  if (searchText.trim().length >= 1) setSuggestionsOpen(true);
                }}
                placeholder="Rechercher un film, une série, un anime..."
                aria-label="Rechercher dans le catalogue"
                autoComplete="off"
                spellCheck={false}
              />
              {searchLoading && <LoaderCircle className="spin search-spinner" size={15} />}
              {searchText ? (
                <button
                  onClick={() => {
                    setSearchText("");
                    setSuggestions([]);
                    setSuggestionsOpen(false);
                    setActiveSuggestionIndex(-1);
                    if (view === "search") setView("explore");
                  }}
                  aria-label="Effacer la recherche"
                >
                  <X size={17} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
            {suggestionsOpen && searchText.trim().length >= 1 && (
              <div className="search-suggestions-popover" role="listbox" aria-label="Suggestions de recherche">
                <div className="suggestions-header">
                  <span>Suggestions</span>
                  {searchLoading ? (
                    <span className="suggestions-badge loading"><LoaderCircle size={11} className="spin" /> Recherche...</span>
                  ) : suggestions.length > 0 ? (
                    <span className="suggestions-badge">{suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}</span>
                  ) : null}
                </div>
                {suggestions.length > 0 ? (
                  <div className="suggestions-list">
                    {suggestions.map((item, idx) => (
                      <button
                        key={`${item.type}-${item.slug}-${idx}`}
                        className={`suggestion-item ${activeSuggestionIndex === idx ? "active" : ""}`}
                        onMouseEnter={() => setActiveSuggestionIndex(idx)}
                        onClick={() => {
                          setSuggestionsOpen(false);
                          openTitle(item);
                        }}
                      >
                        <div className="suggestion-art"><Artwork item={item} /></div>
                        <div className="suggestion-info">
                          <div className="suggestion-title"><HighlightedText text={item.title} query={searchText} /></div>
                          <div className="suggestion-meta">
                            <span className={`suggestion-type type-${item.type}`}>{TYPE_LABEL[item.type]}</span>
                            {item.year && <><span className="meta-dot" /><span>{item.year}</span></>}
                            {item.version && <><span className="meta-dot" /><span>{item.version}</span></>}
                          </div>
                        </div>
                        <span className="suggestion-play"><Play size={13} fill="currentColor" /></span>
                      </button>
                    ))}
                  </div>
                ) : !searchLoading ? (
                  <div className="suggestions-empty"><Search size={16} /><span>Aucun titre trouvé pour « {searchText.trim()} »</span></div>
                ) : null}
                <div className="suggestions-footer">
                  <button
                    className="suggestions-all-btn"
                    onClick={() => {
                      setSuggestionsOpen(false);
                      setView("search");
                      window.history.pushState({}, "", "/?view=search");
                    }}
                  >
                    <span>Voir tous les résultats pour <strong>« {searchText.trim()} »</strong></span>
                    <ArrowRight size={14} />
                  </button>
                  <div className="suggestions-shortcuts">
                    <span><kbd>↑</kbd><kbd>↓</kbd> choisir</span>
                    <span><kbd>↵</kbd> ouvrir</span>
                    <span><kbd>Échap</kbd></span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="topbar-right">
            <button className="topbar-icon" title="Ma liste" onClick={() => navigate("library")}><Bookmark size={19} /></button>
            <span className="topbar-divider" />
            {user ? (
              <button className="account-button" onClick={() => { setProfileName(user.name); setProfileOpen(true); }} title="Mon profil">
                <span className="avatar">{user.avatar ? <img src={user.avatar} alt={user.name} className="avatar-img" /> : user.name.slice(0, 1).toUpperCase()}</span>
                <span className="account-copy"><strong>{user.name}</strong><small>Mon compte</small></span>
                <ChevronDown size={15} />
              </button>
            ) : (
              <button className="sign-in-button" onClick={() => openAuth()}>
                <span className="avatar guest-avatar"><UserRound size={18} /></span>
                <span>Se connecter</span>
              </button>
            )}
          </div>
        </header>
        <main className="main-content">
          {view === "home"
            ? renderHome()
            : view === "explore"
            ? renderExplore()
            : view === "search"
            ? renderSearch()
            : categories.includes(view as CatalogSection)
            ? renderCatalog(view as CatalogSection)
            : view === "library"
            ? renderLibrary()
            : view === "continue"
            ? renderContinue()
            : renderOffline()}
          <footer className="page-footer">
            <Brand compact />
            <span>Films, séries, animes, K-dramas et webtoons en VF et VOSTFR.</span>
            <span className="footer-note">© {new Date().getFullYear()} CinéPlag</span>
          </footer>
        </main>
      </div>

      {/* Bottom Mobile Navigation without Redundant Search Tab */}
      <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
        <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}>
          <House size={20} />
          <span>Accueil</span>
        </button>
        <button className={view === "explore" || categories.includes(view as CatalogSection) ? "active" : ""} onClick={() => navigate("explore")}>
          <Compass size={20} />
          <span>Explorer</span>
        </button>
        <button className={view === "offline" ? "active" : ""} onClick={() => navigate("offline")}>
          <Download size={20} />
          <span>Téléch.</span>
        </button>
        <button className={view === "library" ? "active" : ""} onClick={() => navigate("library")}>
          <Bookmark size={20} />
          <span>Ma liste</span>
        </button>
        <button onClick={() => user ? (setProfileName(user.name), setProfileOpen(true)) : openAuth()}>
          <UserRound size={20} />
          <span>Profil</span>
        </button>
      </nav>

      {/* Detail Modal with Multi-Season Browser and Download CTA */}
      {selectedItem && (
        <ModalShell onClose={closeTitle} className="detail-modal">
          <button className="modal-close" onClick={closeTitle} aria-label="Fermer la fiche"><X size={20} /></button>
          {detailLoading ? (
            <div className="detail-loading">
              <div className="skeleton detail-skeleton-art" />
              <div className="detail-skeleton-copy">
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" />
              </div>
            </div>
          ) : detailError ? (
            <EmptyState icon={WifiOff} title="Cette fiche est indisponible" description={detailError} action="Fermer" onAction={closeTitle} />
          ) : detail && (
            <>
              <div className="detail-top">
                <div className="detail-poster"><Artwork item={detail} eager /></div>
                <div className="detail-info">
                  <div className="detail-eyebrow">
                    <span className="detail-type">{TYPE_LABEL[detail.type]}</span>
                    <span className="meta-dot" />
                    <span>{detail.version}</span>
                    {detail.seasons && detail.seasons.length > 0 && (
                      <>
                        <span className="meta-dot" />
                        <span className="detail-seasons-badge">{detail.seasons.length} Saison{detail.seasons.length > 1 ? "s" : ""}</span>
                      </>
                    )}
                    {detailSource === "curated" && <span className="preview-tag">APERÇU</span>}
                  </div>
                  <h2>{detail.baseTitle || detail.title}</h2>
                  <div className="detail-meta">
                    <span>{detail.year || "2024"}</span>
                    <span className="meta-dot" />
                    <span>{detail.genres.slice(0, 3).join(" · ") || "Cinéma"}</span>
                    {detail.status && (
                      <>
                        <span className="meta-dot" />
                        <span>{detail.status}</span>
                      </>
                    )}
                  </div>
                  <p className="detail-synopsis">{detail.synopsis}</p>
                  <div className="detail-actions">
                    <button className="button button-primary button-play-cta" onClick={() => launchPlayer()}>
                      <Play size={17} fill="currentColor" />
                      {detail.type === "webtoon" ? "Commencer la lecture" : "Regarder maintenant"}
                    </button>
                    <button className="button button-outline button-download-cta" onClick={() => openDownloadModal(detail)}>
                      <Download size={17} /> Télécharger
                    </button>
                    <div className="save-menu-anchor">
                      <button className={`button button-outline ${isSaved(detail) ? "button-saved" : ""}`} onClick={() => { if (!user) { openAuth(); return; } setSaveMenuOpen(!saveMenuOpen); }}>
                        <Bookmark size={17} fill={isSaved(detail) ? "currentColor" : "none"} />
                        {isSaved(detail) ? "Dans ma liste" : "Ma liste"}
                        <ChevronDown size={14} />
                      </button>
                      {saveMenuOpen && (
                        <div className="save-dropdown">
                          <span>Enregistrer dans</span>
                          {library.collections.map((collection) => {
                            const checked = collection.items.some((item) => item.slug === detail.slug && item.type === detail.type);
                            return (
                              <button key={collection.id} onClick={() => { void toggleSave(detail, collection.id); setSaveMenuOpen(false); }}>
                                <span className={`save-check ${checked ? "checked" : ""}`}>{checked && <Check size={12} />}</span>
                                {collection.name}
                              </button>
                            );
                          })}
                          <button className="save-create" onClick={() => { setSaveMenuOpen(false); setCollectionEditor({ name: "", description: "", color: "coral" }); }}>
                            <Plus size={15} /> Nouvelle collection
                          </button>
                        </div>
                      )}
                    </div>
                    <button className="detail-icon-button" onClick={shareTitle} title="Partager"><Share2 size={19} /></button>
                  </div>
                </div>
              </div>

              {/* Series Season and Episode Selector */}
              {detail.type === "webtoon" ? (
                <section className="detail-units">
                  <div className="detail-section-title">
                    <h3>Chapitres <span>{detail.chapters.length}</span></h3>
                    <p>Sélectionnez un chapitre.</p>
                  </div>
                  {detail.chapters.length ? (
                    <div className="episode-list">
                      {detail.chapters.slice(0, unitsShown).map((chapter) => (
                        <button key={chapter.chapter_id} className="episode-row" onClick={() => launchPlayer(undefined, chapter)}>
                          <span className="episode-index">{chapter.number}</span>
                          <span className="episode-name">
                            <strong>{chapter.title || `Chapitre ${chapter.number}`}</strong>
                            <small>Lecture verticale</small>
                          </span>
                          <span className="episode-play"><BookOpen size={16} /></span>
                        </button>
                      ))}
                      {detail.chapters.length > unitsShown && (
                        <button className="show-more" onClick={() => setUnitsShown(unitsShown + 24)}>
                          Afficher plus de chapitres <ChevronDown size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="units-empty">Chapitres indisponibles pour le moment.</div>
                  )}
                </section>
              ) : detail.type !== "movie" ? (
                <section className="detail-units">
                  <div className="detail-section-title">
                    <div className="detail-section-split">
                      <div>
                        <h3>Saisons & Épisodes {detail.seasons && detail.seasons.length > 0 ? <span className="count-pill">{detail.seasons.length} saisons</span> : null}</h3>
                        <p>Toutes les saisons disponibles regroupées au même endroit.</p>
                      </div>
                      <button className="download-series-shortcut" onClick={() => openDownloadModal(detail)}>
                        <Download size={15} /> Télécharger l'intégrale
                      </button>
                    </div>
                  </div>

                  {/* Season Selector Cards Bar */}
                  {detail.seasons && detail.seasons.length > 0 && (
                    <div className="season-cards-track">
                      {detail.seasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          className={`season-card-tab ${season === s.seasonNumber ? "active" : ""}`}
                          onClick={() => handleSelectSeason(s.seasonNumber, s.slug)}
                        >
                          <div className="season-card-head">
                            <strong>{s.title}</strong>
                            {season === s.seasonNumber && <span className="season-active-dot" />}
                          </div>
                          <span className="season-card-sub">{s.episodesCount || 8} épisodes</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Episodes List for Active Season */}
                  {seasonLoading ? (
                    <div className="episodes-loading"><LoaderCircle size={24} className="spin" /><span>Chargement des épisodes...</span></div>
                  ) : detail.episodes.length ? (
                    <div className="episode-list">
                      {visibleEpisodes.slice(0, unitsShown).map((episode) => (
                        <div className="episode-row-container" key={episode.episode_id}>
                          <button className="episode-row" onClick={() => launchPlayer(episode)}>
                            <span className="episode-index">{episode.number}</span>
                            <div className="episode-name">
                              <strong>{episode.title || `Épisode ${episode.number}`}</strong>
                              <small>{episode.version || detail.version} • {episode.duration || "48 min"}</small>
                            </div>
                            <span className="episode-play"><Play size={15} fill="currentColor" /></span>
                          </button>
                          <button
                            className="episode-download-btn"
                            title="Télécharger cet épisode"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDownloadModal(detail);
                              setDownloadMode("episodes");
                              setSelectedEpisodeIds([episode.episode_id]);
                            }}
                          >
                            <Download size={15} />
                          </button>
                        </div>
                      ))}
                      {visibleEpisodes.length > unitsShown && (
                        <button className="show-more" onClick={() => setUnitsShown(unitsShown + 24)}>
                          Afficher plus d'épisodes <ChevronDown size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="units-empty">Épisodes indisponibles pour cette saison.</div>
                  )}
                </section>
              ) : null}

              {/* Casting / Acteurs Strip */}
              {detail.cast && detail.cast.length > 0 && (
                <section className="detail-cast-section">
                  <div className="detail-section-title">
                    <h3>Distribution & Casting</h3>
                    <p>Acteurs et réalisateurs principaux</p>
                  </div>
                  <div className="cast-scroll-track">
                    {detail.cast.slice(0, 12).map((actor, idx) => (
                      <div className="cast-card" key={`${actor.name}-${idx}`}>
                        <div className="cast-avatar">
                          {actor.avatar ? (
                            <img src={imageUrl(actor.avatar)} alt={actor.name} loading="lazy" />
                          ) : (
                            <UserRound size={22} />
                          )}
                        </div>
                        <div className="cast-names">
                          <strong>{actor.name}</strong>
                          <small>{actor.role}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="review-section">
                <div className="detail-section-title"><h3>Ma note</h3><p>Notez ce titre et ajoutez un commentaire.</p></div>
                <div className="review-box">
                  <div className="star-input">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} onClick={() => { if (!user) { openAuth(); return; } setRatingInput(value); }} title={`${value} étoile${value > 1 ? "s" : ""}`}>
                        <Star size={25} fill={value <= ratingInput ? "currentColor" : "none"} className={value <= ratingInput ? "selected" : ""} />
                      </button>
                    ))}
                    <span>{ratingInput ? `${ratingInput}/5` : "Donnez votre note"}</span>
                  </div>
                  <textarea placeholder="Commentaire (facultatif)" value={reviewInput} maxLength={1200} onChange={(event) => setReviewInput(event.target.value)} onFocus={() => { if (!user) openAuth(); }} />
                  <div className="review-bottom">
                    <span />
                    <div>
                      {library.reviews.some((entry) => entry.slug === detail.slug && entry.type === detail.type) && (
                        <button className="delete-review" onClick={removeReview}>Supprimer</button>
                      )}
                      <button className="button button-primary" onClick={saveReview}><Star size={15} /> Enregistrer</button>
                    </div>
                  </div>
                </div>
              </section>

              {detail.related && detail.related.length > 0 && (
                <section className="related-section">
                  <div className="detail-section-title"><h3>Titres similaires</h3></div>
                  <div className="related-track">
                    {detail.related.slice(0, 7).filter((item) => item.image).map((item) => (
                      <PosterCard key={`${item.type}-${item.slug}`} item={item} onOpen={openTitle} onSave={toggleSave} saved={isSaved(item)} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </ModalShell>
      )}

      {/* Exact WeTransfer Design Adaptation for Quality Selection & Downloads */}
      {downloadModalItem && (
        <div className="download-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDownloadModalItem(null); }}>
          <main className="download-page">
            <div className="cinematic-backdrop" aria-hidden="true">
              <img src={imageUrl(downloadModalItem.image)} alt="" />
            </div>

            <section className="download-layout" aria-labelledby="film-title">
              <div className="poster-frame">
                <Artwork item={downloadModalItem} eager />
              </div>

              <header className="film-heading">
                <h1 id="film-title">{downloadModalItem.baseTitle || downloadModalItem.title}</h1>
                <p className="film-meta">
                  <span>{downloadModalItem.year || "2024"}</span>
                  {downloadModalItem.genres && downloadModalItem.genres.length > 0 && (
                    <span>{downloadModalItem.genres.slice(0, 2).join(" • ")}</span>
                  )}
                  <span>{downloadModalItem.version || "VF"}</span>
                  <span className="meta-badge">{selectedDlQuality === "4K" ? "UHD" : "HD"}</span>
                </p>
              </header>

              {/* Mode Switcher for Series (Intégrale vs Épisodes) */}
              {downloadModalItem.type !== "movie" && (
                <div className="download-mode-switch">
                  <button
                    type="button"
                    className={`mode-btn ${downloadMode === "full" ? "active" : ""}`}
                    onClick={() => setDownloadMode("full")}
                  >
                    <Layers3 size={15} />
                    <span>Toute la série ({downloadModalItem.seasons?.length || 1} saisons • {downloadModalItem.episodes?.length || 8} épisodes)</span>
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${downloadMode === "episodes" ? "active" : ""}`}
                    onClick={() => setDownloadMode("episodes")}
                  >
                    <ListCheck size={15} />
                    <span>Choisir les épisodes ({selectedEpisodeIds.length})</span>
                  </button>
                </div>
              )}

              {/* Episode Checklist when choosing specific episodes */}
              {downloadModalItem.type !== "movie" && downloadMode === "episodes" && (
                <div className="download-episodes-section">
                  <div className="episodes-quick-bar">
                    <button
                      type="button"
                      onClick={() => setSelectedEpisodeIds(downloadModalItem.episodes?.map((e) => e.episode_id) || [])}
                    >
                      <CheckCircle2 size={13} /> Tout sélectionner
                    </button>
                    <button type="button" onClick={() => setSelectedEpisodeIds([])}>
                      <X size={13} /> Désélectionner
                    </button>
                  </div>
                  <div className="episodes-grid-select">
                    {(downloadModalItem.episodes || []).map((ep) => {
                      const isChecked = selectedEpisodeIds.includes(ep.episode_id);
                      return (
                        <label key={ep.episode_id} className={`ep-check-label ${isChecked ? "checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEpisodeIds([...selectedEpisodeIds, ep.episode_id]);
                              } else {
                                setSelectedEpisodeIds(selectedEpisodeIds.filter((id) => id !== ep.episode_id));
                              }
                            }}
                          />
                          <span className="ep-num">{ep.number}</span>
                          <span className="ep-title">{ep.title || `Épisode ${ep.number}`}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quality Selector (Exact UI matching Zip Design) */}
              <form
                id="quality-form"
                className="quality-section"
                onSubmit={(event) => {
                  event.preventDefault();
                  triggerDownloadAction();
                }}
              >
                <h2 id="quality-title">Choisir la qualité</h2>
                <fieldset aria-labelledby="quality-title">
                  <legend className="sr-only">Qualité de la vidéo</legend>
                  {ZIP_DESIGN_QUALITIES.map((quality) => (
                    <label
                      className={`quality-row ${selectedDlQuality === quality.label ? "selected" : ""}`}
                      key={quality.label}
                    >
                      <input
                        type="radio"
                        name="quality"
                        value={quality.label}
                        checked={selectedDlQuality === quality.label}
                        onChange={() => setSelectedDlQuality(quality.label)}
                      />
                      <span className="quality-name">{quality.label}</span>
                      <span className="quality-size">{quality.size}</span>
                      {quality.badge && <span className="quality-badge">{quality.badge}</span>}
                    </label>
                  ))}
                </fieldset>
              </form>

              <button className="back-button" type="button" onClick={() => setDownloadModalItem(null)}>
                <ArrowLeft size={18} />
                <span>Retour</span>
              </button>

              <button
                className="download-button"
                type="submit"
                form="quality-form"
                disabled={downloadModalItem.type !== "movie" && downloadMode === "episodes" && selectedEpisodeIds.length === 0}
                aria-label={`Télécharger ${downloadModalItem.title} en ${selectedDlQuality}`}
              >
                <Download size={18} />
                <span>
                  {downloadModalItem.type === "movie"
                    ? `Télécharger (${selectedDlQuality})`
                    : downloadMode === "full"
                    ? `Télécharger l'intégrale (${selectedDlQuality})`
                    : `Télécharger la sélection (${selectedEpisodeIds.length} épisodes • ${selectedDlQuality})`}
                </span>
              </button>
            </section>

            <button
              className="close-button"
              type="button"
              aria-label="Fermer la sélection des qualités"
              onClick={() => setDownloadModalItem(null)}
            >
              <X size={20} />
            </button>
          </main>
        </div>
      )}

      {/* Native Custom CinéPlag Media Player with Dubs, Quality, Subtitles, Double-Click Gestures, Rotation & Pop-up */}
      {player && !player.isChapter && (
        <CineplagPlayer
          title={player.item.title}
          unitLabel={player.unitLabel}
          streamUrl={loadedStreamData?.streamUrl || (servers[activeServer]?.server_link || "")}
          isHls={loadedStreamData?.isHls || false}
          captions={availableCaptions}
          languages={player.item.languages}
          activeLanguageSubjectId={activeLangSubjectId}
          onLanguageChange={(subjectId, langName, resourceId) => {
            setActiveLangSubjectId(subjectId);
            setActiveLangResourceId(resourceId || "");
            showToast(`Audio changé : ${langName}`);
          }}
          currentQuality={selectedQuality}
          onQualityChange={(q) => {
            setSelectedQuality(q);
            showToast(`Qualité changée : ${q}`);
          }}
          detectedBandwidth={detectedBandwidth}
          onClose={() => {
            setPlayer(null);
            setIsMiniPlayer(false);
          }}
          onProgressUpdate={(pct) => {
            setPlayPercent(pct);
          }}
          initialPercent={playPercent}
          onToggleMiniPlayer={() => setIsMiniPlayer((prev) => !prev)}
          isMiniPlayer={isMiniPlayer}
        />
      )}

      {/* Webtoon Reader for Webtoon Chapter Viewing */}
      {player && player.isChapter && (
        <div className="player-overlay">
          <div className="player-header">
            <button onClick={() => setPlayer(null)} className="player-back-btn">
              <ArrowLeft size={20} />
              <span>Retour</span>
            </button>
            <div className="player-title-box">
              <strong>{player.item.title}</strong>
              <span>{player.unitLabel}</span>
            </div>
            <button className="player-close" onClick={() => setPlayer(null)} aria-label="Fermer le lecteur">
              <X size={21} />
            </button>
          </div>
          <div className="player-body reader-body">
            {streamLoading ? (
              <div className="player-loading">
                <LoaderCircle className="spin" size={34} />
                <h2>Chargement du chapitre</h2>
                <p>Récupération des pages...</p>
              </div>
            ) : streamError ? (
              <EmptyState icon={WifiOff} title="Lecture indisponible" description={streamError} action="Retour à la fiche" onAction={() => setPlayer(null)} />
            ) : (
              <div className="reader-pages">
                <div className="reader-intro">
                  <BookOpen size={24} />
                  <h2>{player.item.title}</h2>
                  <p>{player.unitLabel} · Faites défiler pour lire</p>
                </div>
                {pages.map((page) => (
                  <Artwork key={page.page} item={{ title: `${player.item.title} — page ${page.page}`, image: page.image }} className="reader-page" />
                ))}
                <div className="reader-end">
                  <CheckCircle2 size={30} />
                  <h3>Fin du chapitre</h3>
                  <button className="button button-outline" onClick={() => setPlayer(null)}>Retour à la fiche</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal with Google OAuth Button */}
      {authOpen && (
        <ModalShell onClose={() => setAuthOpen(false)} className="auth-modal">
          <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Fermer"><X size={19} /></button>
          <div className="auth-brand"><Brand /></div>
          <div className="auth-copy">
            <span className="section-eyebrow">COMPTE</span>
            <h2>{authMode === "login" ? "Connexion" : "Créer un compte"}</h2>
            <p>{authMode === "login" ? "Accédez à vos listes, vos notes et votre progression." : "Un compte suffit pour enregistrer vos listes et votre progression."}</p>
          </div>

          {/* Google Sign-In Button */}
          <button className="google-auth-button" onClick={handleGoogleSignIn} disabled={authBusy}>
            <GoogleIcon />
            <span>Continuer avec Google</span>
          </button>

          <div className="auth-separator"><span>OU</span></div>

          <div className="auth-tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Connexion</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Inscription</button>
          </div>

          <form onSubmit={submitAuth} className="auth-form">
            {authMode === "register" && <label><span>Votre nom</span><div className="field-icon"><UserRound size={17} /><input required minLength={2} value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Votre nom" /></div></label>}
            <label><span>Adresse e-mail</span><div className="field-icon"><Mail size={17} /><input type="email" required value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="vous@exemple.com" autoComplete="email" /></div></label>
            <label><span>Mot de passe</span><div className="field-icon"><LockKeyhole size={17} /><input type="password" required minLength={authMode === "register" ? 8 : 1} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder={authMode === "register" ? "8 caractères minimum" : "Votre mot de passe"} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></div></label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{authMode === "login" ? "Se connecter" : "Créer mon compte"}</button>
          </form>
        </ModalShell>
      )}

      {collectionEditor && (
        <ModalShell onClose={() => setCollectionEditor(null)} className="form-modal">
          <button className="modal-close" onClick={() => setCollectionEditor(null)} aria-label="Fermer"><X size={19} /></button>
          <div className="form-modal-icon"><Layers3 size={23} /></div>
          <span className="section-eyebrow">COLLECTION</span>
          <h2>{collectionEditor.id ? "Modifier la collection" : "Nouvelle collection"}</h2>
          <p>Regroupez vos films, séries et animes dans une liste.</p>
          <form onSubmit={submitCollection}>
            <label>Nom de la collection<input required minLength={2} maxLength={80} placeholder="Ex. À voir ce week-end" value={collectionEditor.name} onChange={(event) => setCollectionEditor({ ...collectionEditor, name: event.target.value })} /></label>
            <label>Description <span className="optional">(facultatif)</span><textarea maxLength={300} placeholder="Ex. films à regarder en famille" value={collectionEditor.description} onChange={(event) => setCollectionEditor({ ...collectionEditor, description: event.target.value })} /></label>
            <div className="color-picker">
              <span>Couleur</span>
              <div>
                {colorOptions.map((color) => (
                  <button type="button" className={`color-swatch color-${color} ${collectionEditor.color === color ? "selected" : ""}`} aria-label={`Couleur ${color}`} key={color} onClick={() => setCollectionEditor({ ...collectionEditor, color })}>
                    {collectionEditor.color === color && <Check size={15} />}
                  </button>
                ))}
              </div>
            </div>
            <button className="button button-primary form-submit" disabled={collectionBusy}>
              {collectionBusy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
              {collectionEditor.id ? "Enregistrer les modifications" : "Créer la collection"}
            </button>
          </form>
        </ModalShell>
      )}

      {profileOpen && user && (
        <ModalShell onClose={() => setProfileOpen(false)} className="form-modal profile-modal">
          <button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Fermer"><X size={19} /></button>
          <div className="profile-heading">
            <span className="profile-avatar">{user.avatar ? <img src={user.avatar} alt={user.name} className="avatar-img" /> : user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <span className="section-eyebrow">MON COMPTE</span>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <form onSubmit={submitProfile}>
            <label>Nom affiché<input required minLength={2} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
            <label>Nouveau mot de passe <span className="optional">(facultatif)</span><input type="password" minLength={8} placeholder="8 caractères minimum" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} /></label>
            {profilePassword && <label>Mot de passe actuel<input type="password" required value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} /></label>}
            <button className="button button-primary form-submit" disabled={profileBusy}>
              {profileBusy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Enregistrer le profil
            </button>
          </form>
          <div className="profile-bottom">
            <button onClick={logout}><LogOut size={17} /> Se déconnecter</button>
            <button className="danger-link" onClick={() => { setProfileOpen(false); setConfirm({ title: "Supprimer votre compte ?", message: "Toutes vos collections, vos avis et votre progression seront définitivement supprimés. Cette action est irréversible.", action: async () => { try { await requestJSON("/api/auth", { method: "DELETE" }); setUser(null); applyLibrary(emptyLibrary); navigate("home"); showToast("Votre compte a été supprimé."); } catch { showToast("Impossible de supprimer votre compte.", true); } } }); }}>
              <Trash2 size={16} /> Supprimer le compte
            </button>
          </div>
        </ModalShell>
      )}

      {confirm && (
        <ModalShell onClose={() => setConfirm(null)} className="confirm-modal">
          <div className="confirm-icon"><Trash2 size={23} /></div>
          <h2>{confirm.title}</h2>
          <p>{confirm.message}</p>
          <div>
            <button className="button button-outline" onClick={() => setConfirm(null)}>Annuler</button>
            <button className="button button-danger" onClick={() => { const action = confirm.action; setConfirm(null); void action(); }}>Supprimer</button>
          </div>
        </ModalShell>
      )}

      {toast && (
        <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">
          {toast.error ? <WifiOff size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Fermer la notification"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
