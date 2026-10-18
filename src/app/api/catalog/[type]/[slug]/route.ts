import { getCatalogDetail, validType } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  if (!validType(type) || !slug || slug.length > 255) return Response.json({ error: "Titre invalide." }, { status: 400 });
  const result = await getCatalogDetail(type, slug);
  if (!result.detail) return Response.json({ error: "Ce titre est introuvable ou temporairement indisponible." }, { status: 404 });
  return Response.json(result);
}
