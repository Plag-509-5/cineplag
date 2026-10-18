import { getSearchSuggestions, listCatalog, searchCatalog, validSection } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const suggest = params.get("suggest");
  if (suggest !== null) {
    if (suggest.trim().length < 1) return Response.json({ suggestions: [] });
    return Response.json(await getSearchSuggestions(suggest.slice(0, 80)));
  }

  const query = params.get("q");
  if (query !== null) {
    if (query.trim().length < 1) return Response.json({ items: [], source: "live", notice: "" });
    return Response.json(await searchCatalog(query.slice(0, 100)));
  }

  const section = params.get("section") || "movies";
  if (!validSection(section)) return Response.json({ error: "Catégorie inconnue." }, { status: 400 });
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const genre = (params.get("genre") || "").replace(/[^a-zA-ZÀ-ÿ0-9-]/g, "").slice(0, 40);
  const sort = params.get("sort") === "az" ? "az" : "latest";

  return Response.json(await listCatalog(section, page, genre, sort));
}
