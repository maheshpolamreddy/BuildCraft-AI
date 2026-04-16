const K1 = 1.2;
const B = 0.75;

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "as", "is", "was", "are", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need",
  "this", "that", "these", "those", "it", "its", "we", "you", "they", "them", "their", "our",
  "not", "no", "yes", "also", "just", "into", "about", "over", "such", "than", "then", "there",
  "when", "where", "which", "who", "whom", "how", "why", "what", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "any", "very", "here", "out", "up", "down", "new",
  "using", "use", "used", "based", "build", "building", "create", "creating", "make", "making",
]);

const SPLIT = /[^a-z0-9+#.]+/i;

export function normalizeSkillToken(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\.(js|ts|jsx|tsx)$/i, "")
    .replace(/[^a-z0-9+#]/g, "");
}

export function tokenize(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  for (const part of text.toLowerCase().split(SPLIT)) {
    const t = normalizeSkillToken(part);
    if (t.length < 2) continue;
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

export function tokenBag(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(text)) {
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

export function jaccardTokenBags(a: Map<string, number>, b: Map<string, number>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const k of smaller.keys()) {
    if (larger.has(k)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export type Bm25Corpus = {
  docTokens: string[][];
  docLen: number[];
  avgdl: number;
  N: number;
  idf: Map<string, number>;
};

export function buildBm25Corpus(documents: string[]): Bm25Corpus {
  const docTokens = documents.map((d) => tokenize(d));
  const docLen = docTokens.map((t) => t.length);
  const N = docTokens.length;
  const totalLen = docLen.reduce((s, n) => s + n, 0);
  const avgdl = N > 0 ? totalLen / N : 0;

  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, c] of df) {
    idf.set(term, Math.log(1 + (N - c + 0.5) / (c + 0.5)));
  }

  return { docTokens, docLen, avgdl, N, idf };
}

/** Rare query-only terms get a high IDF so matching still rewards documents that contain them. */
export function augmentIdfForQueryTerms(corpus: Bm25Corpus, queryTokens: string[]): void {
  const N = corpus.N;
  for (const q of queryTokens) {
    if (!corpus.idf.has(q)) {
      corpus.idf.set(q, Math.log(1 + (N + 0.5) / 0.5));
    }
  }
}

export function bm25Score(queryTokens: string[], docIndex: number, corpus: Bm25Corpus): number {
  if (!queryTokens.length || corpus.N === 0) return 0;
  const tokens = corpus.docTokens[docIndex] ?? [];
  const dl = corpus.docLen[docIndex] ?? 0;
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }

  let score = 0;
  const avgdl = corpus.avgdl || 1;
  for (const q of queryTokens) {
    const idf = corpus.idf.get(q) ?? 0;
    if (idf === 0) continue;
    const f = tf.get(q) ?? 0;
    const num = f * (K1 + 1);
    const den = f + K1 * (1 - B + B * (dl / avgdl));
    score += idf * (num / den);
  }
  return score;
}

export function minMaxNorm(scores: number[]): number[] {
  if (!scores.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const span = max - min;
  if (span < 1e-9) return scores.map(() => (scores.length ? 1 : 0));
  return scores.map((s) => (s - min) / span);
}
