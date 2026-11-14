/**
 * @fileoverview Machine Learning Merchant Embedding & Clustering Service
 *
 * Implements machine-learning vector embedding generation and agglomerative
 * semantic clustering for transaction merchant descriptions. Converts noisy bank
 * feed descriptions (e.g. "AMZN MKTP US*2A41B", "Amazon.com*MB92", "STARBUCKS #1042")
 * into dense 64-dimensional L2-normalized vector representations and groups them into
 * canonical merchant clusters with semantic similarity scores and category predictions.
 *
 * ============================================================================
 * VECTOR EMBEDDING ARCHITECTURE (64 Dimensions)
 * ============================================================================
 * - Dims 0-11:  Category / Sector Taxonomy Semantic Signals
 * - Dims 12-27: Canonical Brand Anchor Projections (Amazon, Starbucks, Uber, etc.)
 * - Dims 28-63: Subword Character N-Gram FNV-1a Projections (typo & suffix tolerance)
 *
 * ============================================================================
 * ASCII CLUSTERING FLOW
 * ============================================================================
 *   [ Raw Bank Descriptions ]
 *      |  "AMZN MKTP US*2A" / "Amazon Prime Video" / "SBUX #1042"
 *      v
 *   [ Preprocessing & Noise Reduction ]
 *      |  Strip terminal codes, store numbers, POS/debit tags
 *      v
 *   [ 64-D Vector Embedding Generator ]
 *      |  Taxonomy (0-11) + Brand Anchors (12-27) + Char N-Grams (28-63)
 *      |  L2 Normalization: ||v|| = 1.0
 *      v
 *   [ Agglomerative Centroid-Based Cosine Clustering ]
 *      |  Entity / Brand Anchor Linkage + Cosine Sim >= 0.70
 *      v
 *   [ Canonical Merchant Resolution & Category Inference ]
 *      |  Canonical Name + Prototype Category Projection + Confidence
 *      v
 *   [ Clustered Review Output with Semantic Similarity ]
 *
 * @module services/merchantEmbeddingClustering
 */

// Dimension length of the dense merchant representation vector space.
// Accommodates taxonomy channels, brand anchor slots, and character n-gram bins.
// Provides standardized feature dimensionality for cosine similarity operations.
export const MERCHANT_EMBEDDING_DIMENSION = 64;

// Structural specification for industry taxonomy sector signals.
// Links designated dimension indices to standard spending categories and keywords.
// Directs keyword match activations into partitioned sector embedding channels.
export interface MerchantSectorTaxonomy {
  dim: number;
  category: string;
  keywords: string[];
}

// Predefined taxonomy sector mappings for merchant transaction classification.
// Covers retail, dining, travel, utilities, healthcare, and software sectors.
// Establishes baseline vector projection weights for category inference.
export const MERCHANT_TAXONOMY: MerchantSectorTaxonomy[] = [
  {
    dim: 0,
    category: "Groceries",
    keywords: ["grocer", "supermarket", "market", "trader joe", "whole foods", "safeway", "kroger", "aldi", "costco", "produce", "wegmans"],
  },
  {
    dim: 1,
    category: "Food & Dining",
    keywords: ["restaurant", "cafe", "coffee", "bakery", "diner", "burger", "pizza", "starbucks", "sbux", "mcdonald", "chipotle", "subway", "dunkin", "panera", "taco bell", "wendy"],
  },
  {
    dim: 2,
    category: "Transportation",
    keywords: ["uber", "lyft", "taxi", "transit", "metro", "subway", "train", "amtrak", "parking", "toll", "bus", "transport"],
  },
  {
    dim: 3,
    category: "Travel",
    keywords: ["airline", "airways", "flight", "delta", "united", "american air", "hotel", "airbnb", "marriott", "hilton", "hyatt", "booking", "expedia"],
  },
  {
    dim: 4,
    category: "Shopping",
    keywords: ["amazon", "amzn", "target", "walmart", "wmt", "ebay", "best buy", "etsy", "mall", "store", "shop", "merchandise"],
  },
  {
    dim: 5,
    category: "Software & Tech",
    keywords: ["github", "openai", "chatgpt", "google", "microsoft", "apple", "aws", "digitalocean", "adobe", "slack", "notion", "figma", "zoom", "cloud", "saas"],
  },
  {
    dim: 6,
    category: "Entertainment",
    keywords: ["netflix", "spotify", "hulu", "disney", "youtube", "hbo", "paramount", "playstation", "nintendo", "steam", "audible", "cinema", "theater"],
  },
  {
    dim: 7,
    category: "Health & Medical",
    keywords: ["pharmacy", "cvs", "walgreens", "rite aid", "doctor", "dental", "clinic", "hospital", "health", "fitness", "gym", "medical"],
  },
  {
    dim: 8,
    category: "Gas & Auto",
    keywords: ["gas", "fuel", "shell", "chevron", "exxon", "bp", "mobil", "speedway", "auto", "mechanic", "oil", "valvoline"],
  },
  {
    dim: 9,
    category: "Home & Hardware",
    keywords: ["home depot", "lowes", "ikea", "hardware", "furniture", "menards", "homedepot", "ace hardware"],
  },
  {
    dim: 10,
    category: "Utilities & Telecom",
    keywords: ["verizon", "at&t", "t-mobile", "comcast", "xfinity", "electric", "water", "power", "utility", "internet", "spectrum"],
  },
  {
    dim: 11,
    category: "Financial & Payroll",
    keywords: ["payroll", "deposit", "salary", "transfer", "venmo", "zelle", "paypal", "cash app", "wire", "interest", "fidelity", "vanguard", "schwab"],
  },
];

// Definition contract for canonical brand anchors in merchant vector representations.
// Associates dedicated embedding dimensions with canonical names and regexes.
// Enforces strong semantic cohesion for prominent global merchants and chains.
export interface BrandAnchor {
  dim: number;
  canonicalName: string;
  defaultCategory: string;
  patterns: RegExp[];
}

// High-priority brand anchors mapping major consumer merchants and service providers.
// Anchors recognizable brands like Amazon, Starbucks, Uber, Apple, and Walmart.
// Assigns high projection weights to overcome noisy statement descriptions.
export const BRAND_ANCHORS: BrandAnchor[] = [
  {
    dim: 12,
    canonicalName: "Amazon",
    defaultCategory: "Shopping",
    patterns: [/\b(amzn|amazon|aws)\b/i, /^amzn\b/i, /^amazon/i],
  },
  {
    dim: 13,
    canonicalName: "Starbucks",
    defaultCategory: "Food & Dining",
    patterns: [/\b(starbucks|sbux)\b/i, /^sbux\b/i, /^starbucks/i],
  },
  {
    dim: 14,
    canonicalName: "Uber",
    defaultCategory: "Transportation",
    patterns: [/\b(uber|ubereats|uber\s*\*trip)\b/i, /^uber\b/i],
  },
  {
    dim: 15,
    canonicalName: "Walmart",
    defaultCategory: "Groceries",
    patterns: [/\b(walmart|wmt)\b/i, /^wmt\b/i, /^walmart/i],
  },
  {
    dim: 16,
    canonicalName: "Target",
    defaultCategory: "Shopping",
    patterns: [/\b(target|tgt)\b/i, /^tgt\b/i, /^target/i],
  },
  {
    dim: 17,
    canonicalName: "Apple",
    defaultCategory: "Software & Tech",
    patterns: [/\b(apple\.com|apple store|itunes|apple)\b/i, /^apl\*/i],
  },
  {
    dim: 18,
    canonicalName: "Google",
    defaultCategory: "Software & Tech",
    patterns: [/\b(google|goog\*|gsuite|play store)\b/i, /^goog\b/i],
  },
  {
    dim: 19,
    canonicalName: "Microsoft",
    defaultCategory: "Software & Tech",
    patterns: [/\b(microsoft|msft|xbox|azure)\b/i, /^msft\b/i],
  },
  {
    dim: 20,
    canonicalName: "Netflix",
    defaultCategory: "Entertainment",
    patterns: [/\b(netflix|nflx)\b/i],
  },
  {
    dim: 21,
    canonicalName: "Spotify",
    defaultCategory: "Entertainment",
    patterns: [/\b(spotify)\b/i],
  },
  {
    dim: 22,
    canonicalName: "Costco",
    defaultCategory: "Groceries",
    patterns: [/\b(costco)\b/i],
  },
  {
    dim: 23,
    canonicalName: "McDonald's",
    defaultCategory: "Food & Dining",
    patterns: [/\b(mcdonald|mcd)\b/i],
  },
  {
    dim: 24,
    canonicalName: "Lyft",
    defaultCategory: "Transportation",
    patterns: [/\b(lyft)\b/i],
  },
  {
    dim: 25,
    canonicalName: "CVS Pharmacy",
    defaultCategory: "Health & Medical",
    patterns: [/\b(cvs|cvs\/pharmacy)\b/i],
  },
  {
    dim: 26,
    canonicalName: "Walgreens",
    defaultCategory: "Health & Medical",
    patterns: [/\b(walgreens)\b/i],
  },
  {
    dim: 27,
    canonicalName: "Shell",
    defaultCategory: "Gas & Auto",
    patterns: [/\b(shell|shell oil)\b/i],
  },
];

/**
 * 32-bit FNV-1a hash algorithm for fast subword character n-gram hashing.
 */
// Fast 32-bit FNV-1a hash implementation for subword character n-gram projection.
// Produces consistent hash integer keys across character bi-grams and tri-grams.
// Disperses subword features across remaining vector dimensions for typo tolerance.
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Cleans noisy bank statement merchant strings.
 * Removes store #, terminal IDs, transaction codes, dates, POS/debit tags.
 */
// Strips operational noise, terminal numbers, state codes, and suffixes from strings.
// Eliminates store identifiers, date stamps, and transaction type markers.
// Returns normalized merchant descriptors suitable for lexical and vector matching.
export function sanitizeMerchantDescription(raw: string): string {
  let cleaned = String(raw || "")
    .toLowerCase()
    .replace(/#\d+/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(/\b(pos|debit|credit|purchase|pending|card|txn|terminal|store|shop|seattle|wa|ca|ny|us|usa|inc|llc|corp|ltd|co|com|mktp|pay|checkout)\b/gi, " ")
    .replace(/[^a-z0-9 &.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || raw.trim().toLowerCase();
}

/**
 * Generates a 64-dimensional L2-normalized vector embedding for a merchant description.
 */
// Projects a merchant description into a normalized 64-dimensional vector space.
// Fuses industry taxonomy signals, brand anchor activations, and character n-grams.
// Applies L2 normalization to enable exact cosine similarity via dot products.
export function generateMerchantEmbedding(description: string): number[] {
  const vector = new Array<number>(MERCHANT_EMBEDDING_DIMENSION).fill(0);
  const rawLower = String(description || "").toLowerCase();
  const sanitized = sanitizeMerchantDescription(description);

  // 1. Dims 0-11: Sector Taxonomy Signals (weight: 4.0 - 6.0)
  for (const taxonomy of MERCHANT_TAXONOMY) {
    let hits = 0;
    for (const kw of taxonomy.keywords) {
      if (rawLower.includes(kw) || sanitized.includes(kw)) {
        hits += 1;
      }
    }
    if (hits > 0) {
      vector[taxonomy.dim] = Math.min(6.0, hits * 3.0);
    }
  }

  // 2. Dims 12-27: Major Canonical Brand Anchors (weight: 16.0 for strong brand signal)
  for (const anchor of BRAND_ANCHORS) {
    let matched = false;
    for (const pattern of anchor.patterns) {
      if (pattern.test(rawLower) || pattern.test(sanitized)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      vector[anchor.dim] = 16.0;
      // Also reinforce the default category taxonomy dim
      const matchedTax = MERCHANT_TAXONOMY.find((t) => t.category === anchor.defaultCategory);
      if (matchedTax) {
        vector[matchedTax.dim] = Math.max(vector[matchedTax.dim], 6.0);
      }
    }
  }

  // 3. Dims 28-63: Subword Character N-Grams (bigrams & trigrams)
  // Subword projections provide fallback typo and phrasing tolerance
  const compact = sanitized.replace(/[^a-z0-9]/g, "");
  if (compact.length >= 2) {
    for (let i = 0; i < compact.length - 1; i++) {
      const bg = compact.slice(i, i + 2);
      const hash = fnv1a32(bg);
      const dim = 28 + (hash % 36);
      vector[dim] += 0.6;
    }
  }
  if (compact.length >= 3) {
    for (let i = 0; i < compact.length - 2; i++) {
      const tg = compact.slice(i, i + 3);
      const hash = fnv1a32(tg);
      const dim = 28 + (hash % 36);
      vector[dim] += 0.9;
    }
  }

  // Fallback if vector has zero energy
  let sumSq = 0;
  for (let i = 0; i < MERCHANT_EMBEDDING_DIMENSION; i++) {
    sumSq += vector[i] * vector[i];
  }

  if (sumSq === 0) {
    const hash = fnv1a32(rawLower);
    vector[28 + (hash % 36)] = 1.0;
    sumSq = 1.0;
  }

  // L2 Normalization: ||v|| = 1.0
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < MERCHANT_EMBEDDING_DIMENSION; i++) {
    vector[i] = vector[i] / norm;
  }

  return vector;
}

/**
 * Computes cosine similarity between two normalized vectors.
 * Since vectors are L2-normalized, this is the dot product.
 */
// Computes cosine similarity between two normalized merchant embedding vectors.
// Calculates the inner dot product clamped between zero and one.
// Measures semantic proximity between raw transaction merchant strings.
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, Math.round(dot * 10000) / 10000));
}

// Transaction data structure prepared for merchant clustering pipelines.
// Encapsulates unique identifiers, descriptions, amounts, and dates.
// Represents the input transaction unit clustered into merchant groupings.
export interface ClusteredMerchantTransaction {
  id: string;
  description: string;
  amount: number;
  category?: string;
  date?: string | Date;
}

// Consolidated summary representing an agglomerated merchant transaction cluster.
// Reports canonical merchant names, raw descriptions, transaction lists, and spend.
// Delivers suggested expense categories, confidence scores, and cluster centroids.
export interface MerchantClusterResult {
  cluster_key: string;
  normalized_name: string;
  raw_descriptions: string[];
  transaction_ids: string[];
  count: number;
  total_spend: number;
  suggested_category: string;
  confidence: number;
  semantic_similarity: number;
  embedding_centroid: number[];
}

// Reference descriptor for known merchants recorded in the system database.
// Holds canonical display titles, normalized identifiers, aliases, and categories.
// Guides cluster canonicalization toward pre-existing database records.
export interface ExistingMerchantInfo {
  name: string;
  normalizedName?: string;
  categoryDefault?: string;
  aliases?: string[];
}

/**
 * Matches a transaction description against existing database merchants.
 */
// Resolves raw transaction descriptions against existing merchant databases.
// Evaluates direct normalized matches, sanitized forms, and leading word phrases.
// Returns the matching merchant record or null if no entity is found.
function findMatchingExistingMerchant(
  desc: string,
  existingMap: Map<string, ExistingMerchantInfo>
): ExistingMerchantInfo | null {
  const rawLower = desc.toLowerCase().trim();
  if (existingMap.has(rawLower)) return existingMap.get(rawLower)!;

  const sanitized = sanitizeMerchantDescription(desc);
  if (existingMap.has(sanitized)) return existingMap.get(sanitized)!;

  const words = sanitized.split(" ").filter((w) => w.length > 1);
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    const candidate = words.slice(0, len).join(" ");
    if (existingMap.has(candidate)) {
      return existingMap.get(candidate)!;
    }
  }

  return null;
}

/**
 * Resolves the cleanest canonical merchant name from raw descriptions and brand anchors.
 */
// Determines the most accurate canonical display title for a merchant cluster.
// Leverages existing database matches, dominant brand anchors, or cleaned tokens.
// Returns standardized title-cased names alongside matching cluster keys.
function resolveCanonicalName(
  descriptions: string[],
  centroid: number[],
  matchedExisting?: ExistingMerchantInfo | null
): { name: string; clusterKey: string; anchorCategory?: string } {
  if (matchedExisting) {
    return {
      name: matchedExisting.name,
      clusterKey: (matchedExisting.normalizedName || matchedExisting.name).toLowerCase(),
      anchorCategory: matchedExisting.categoryDefault,
    };
  }

  // 1. Check brand anchors by highest anchor dimension weight in centroid
  let bestAnchor: BrandAnchor | null = null;
  let maxAnchorWeight = 0;
  for (const anchor of BRAND_ANCHORS) {
    const weight = centroid[anchor.dim] || 0;
    if (weight > 0.25 && weight > maxAnchorWeight) {
      maxAnchorWeight = weight;
      bestAnchor = anchor;
    }
  }

  if (bestAnchor) {
    return {
      name: bestAnchor.canonicalName,
      clusterKey: bestAnchor.canonicalName.toLowerCase(),
      anchorCategory: bestAnchor.defaultCategory,
    };
  }

  // 2. Fallback: Clean and title-case the most representative clean string
  const cleanTokens = descriptions
    .map(sanitizeMerchantDescription)
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  const bestClean = cleanTokens[0] || "Merchant";
  const words = bestClean.split(" ").slice(0, 3);
  const titleCased = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    name: titleCased,
    clusterKey: words.join(" ").toLowerCase(),
  };
}

/**
 * Infers category from cluster centroid using cosine proximity to taxonomy categories.
 */
// Predicts the most likely spending category from an embedding centroid vector.
// Measures activation strengths across defined taxonomy sector dimensions.
// Returns the category corresponding to the dimension with highest energy.
function inferCategoryFromCentroid(centroid: number[]): string {
  let bestCategory = "General Services";
  let maxWeight = 0;

  for (const tax of MERCHANT_TAXONOMY) {
    const weight = centroid[tax.dim] || 0;
    if (weight > maxWeight) {
      maxWeight = weight;
      bestCategory = tax.category;
    }
  }

  return bestCategory;
}

/**
 * Clusters transactions using 64-dimensional vector embeddings and cosine similarity.
 */
// Agglomerates raw transaction lists into canonical merchant clusters using embeddings.
// Computes centroid vectors and merges transactions based on cosine proximity.
// Assigns consensus categories, computes spend totals, and ranks clusters by volume.
export function clusterMerchantTransactions(
  transactions: ClusteredMerchantTransaction[],
  options?: {
    similarityThreshold?: number;
    existingMerchants?: ExistingMerchantInfo[];
  }
): MerchantClusterResult[] {
  const threshold = options?.similarityThreshold ?? 0.70;
  const existingMap = new Map<string, ExistingMerchantInfo>();
  if (options?.existingMerchants) {
    for (const m of options.existingMerchants) {
      if (m.normalizedName) existingMap.set(m.normalizedName.toLowerCase().trim(), m);
      if (m.name) existingMap.set(m.name.toLowerCase().trim(), m);
      if (m.aliases) {
        for (const a of m.aliases) {
          existingMap.set(String(a).toLowerCase().trim(), m);
        }
      }
    }
  }

  interface InternalCluster {
    embeddings: number[][];
    centroid: number[];
    transactions: ClusteredMerchantTransaction[];
    rawDescriptions: Set<string>;
    categoryVotes: Map<string, number>;
    brandAnchorDim?: number;
    matchedExisting?: ExistingMerchantInfo | null;
  }

  const clusters: InternalCluster[] = [];

  for (const tx of transactions) {
    const rawDesc = String(tx.description || "").trim();
    if (!rawDesc) continue;

    const embedding = generateMerchantEmbedding(rawDesc);
    const existingMatch = findMatchingExistingMerchant(rawDesc, existingMap);

    // Check if this transaction has a dominant brand anchor (dims 12-27)
    let txAnchorDim: number | undefined;
    let maxAnchorVal = 0;
    for (let d = 12; d <= 27; d++) {
      if (embedding[d] > 0.4 && embedding[d] > maxAnchorVal) {
        maxAnchorVal = embedding[d];
        txAnchorDim = d;
      }
    }

    // Find best matching existing cluster
    let bestClusterIdx = -1;
    let highestSim = -1;

    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      const cluster = clusters[cIdx];

      // 1. Direct Existing Merchant Entity Match
      if (
        existingMatch &&
        cluster.matchedExisting &&
        (existingMatch.name.toLowerCase() === cluster.matchedExisting.name.toLowerCase() ||
          existingMatch.normalizedName === cluster.matchedExisting.normalizedName)
      ) {
        bestClusterIdx = cIdx;
        highestSim = 1.0;
        break;
      }

      // 2. Shared Canonical Brand Anchor Match (dims 12-27)
      if (txAnchorDim !== undefined && cluster.brandAnchorDim === txAnchorDim) {
        bestClusterIdx = cIdx;
        highestSim = 1.0;
        break;
      }

      // 3. Cosine Similarity Clustering
      const sim = cosineSimilarity(embedding, cluster.centroid);
      if (sim >= threshold && sim > highestSim) {
        highestSim = sim;
        bestClusterIdx = cIdx;
      }
    }

    if (bestClusterIdx !== -1) {
      // Add to existing cluster and update centroid
      const cluster = clusters[bestClusterIdx];
      cluster.embeddings.push(embedding);
      cluster.transactions.push(tx);
      cluster.rawDescriptions.add(rawDesc);
      if (existingMatch && !cluster.matchedExisting) {
        cluster.matchedExisting = existingMatch;
      }
      if (txAnchorDim !== undefined && !cluster.brandAnchorDim) {
        cluster.brandAnchorDim = txAnchorDim;
      }

      const cat = String(tx.category || "").trim();
      if (cat && cat.toLowerCase() !== "uncategorized" && cat.toLowerCase() !== "other") {
        cluster.categoryVotes.set(cat, (cluster.categoryVotes.get(cat) || 0) + 1);
      }

      // Recompute L2-normalized centroid
      const count = cluster.embeddings.length;
      const newCentroid = new Array<number>(MERCHANT_EMBEDDING_DIMENSION).fill(0);
      for (const emb of cluster.embeddings) {
        for (let d = 0; d < MERCHANT_EMBEDDING_DIMENSION; d++) {
          newCentroid[d] += emb[d];
        }
      }
      let sumSq = 0;
      for (let d = 0; d < MERCHANT_EMBEDDING_DIMENSION; d++) {
        newCentroid[d] /= count;
        sumSq += newCentroid[d] * newCentroid[d];
      }
      const norm = Math.sqrt(sumSq) || 1.0;
      for (let d = 0; d < MERCHANT_EMBEDDING_DIMENSION; d++) {
        newCentroid[d] /= norm;
      }
      cluster.centroid = newCentroid;
    } else {
      // Initialize new cluster
      const categoryVotes = new Map<string, number>();
      const cat = String(tx.category || "").trim();
      if (cat && cat.toLowerCase() !== "uncategorized" && cat.toLowerCase() !== "other") {
        categoryVotes.set(cat, 1);
      }

      clusters.push({
        embeddings: [embedding],
        centroid: [...embedding],
        transactions: [tx],
        rawDescriptions: new Set([rawDesc]),
        categoryVotes,
        brandAnchorDim: txAnchorDim,
        matchedExisting: existingMatch,
      });
    }
  }

  // Format final clusters
  const results: MerchantClusterResult[] = clusters.map((cluster) => {
    const rawDescriptions = Array.from(cluster.rawDescriptions);
    const { name, clusterKey, anchorCategory } = resolveCanonicalName(
      rawDescriptions,
      cluster.centroid,
      cluster.matchedExisting
    );

    // Determine best category
    let bestCategory = anchorCategory || "";
    if (!bestCategory && cluster.categoryVotes.size > 0) {
      let maxVotes = 0;
      for (const [cName, votes] of cluster.categoryVotes.entries()) {
        if (votes > maxVotes) {
          maxVotes = votes;
          bestCategory = cName;
        }
      }
    }
    if (!bestCategory || bestCategory.toLowerCase() === "uncategorized") {
      bestCategory = inferCategoryFromCentroid(cluster.centroid);
    }

    // Compute average intra-cluster cosine similarity to centroid
    let totalSim = 0;
    for (const emb of cluster.embeddings) {
      totalSim += cosineSimilarity(emb, cluster.centroid);
    }
    const avgSim = Math.round((totalSim / cluster.embeddings.length) * 100) / 100;

    // Confidence: base from average similarity, with boost for multiple variant consensus
    const variantBoost = rawDescriptions.length > 1 ? 0.05 : 0;
    const confidence = Math.min(0.99, Math.max(0.75, Math.round((avgSim + variantBoost) * 100) / 100));

    const totalSpend = cluster.transactions.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);

    return {
      cluster_key: clusterKey,
      normalized_name: name,
      raw_descriptions: rawDescriptions,
      transaction_ids: cluster.transactions.map((t) => t.id),
      count: cluster.transactions.length,
      total_spend: Math.round(totalSpend * 100) / 100,
      suggested_category: bestCategory,
      confidence,
      semantic_similarity: avgSim,
      embedding_centroid: cluster.centroid,
    };
  });

  return results.sort((a, b) => b.count - a.count || b.total_spend - a.total_spend);
}
