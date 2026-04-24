import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceAliasPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (typeof val === "string") qs.set(key, val);
    else if (Array.isArray(val)) val.forEach((v) => qs.append(key, v));
  }
  const q = qs.toString();
  const dest = `/developer/workspace/${encodeURIComponent(projectId)}${q ? `?${q}` : ""}`;
  redirect(dest);
}