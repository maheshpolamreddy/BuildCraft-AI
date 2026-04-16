/** Pairwise skill string match (substring either way) for display lists. */
export function skillOverlapAndMissing(
  requiredSkills: string[],
  devSkillsLower: string[],
): { overlap: string[]; missing: string[] } {
  const overlap: string[] = [];
  const missing: string[] = [];
  for (const rs of requiredSkills) {
    const rl = rs.toLowerCase();
    const hit = devSkillsLower.some(
      (ds) => ds.includes(rl) || rl.includes(ds) || tokensRoughEqual(ds, rl),
    );
    if (hit) overlap.push(rs);
    else missing.push(rs);
  }
  return { overlap, missing };
}

function tokensRoughEqual(a: string, b: string): boolean {
  const ta = a.replace(/[^a-z0-9]/g, "");
  const tb = b.replace(/[^a-z0-9]/g, "");
  return ta.length > 2 && tb.length > 2 && (ta === tb || ta.includes(tb) || tb.includes(ta));
}
