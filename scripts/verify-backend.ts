/**
 * STASHd backend verification script
 * Run with: bun run scripts/verify-backend.ts
 * Tests: Supabase connection, read/write, URL ingest, AI, transcript, embeddings, Ask
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const TEST_EMAIL = `stashd-verify-${Date.now()}@test.local`;
const TEST_PASSWORD = "VerifyTest123!";

const pass = (msg: string) => console.log(`  ✅ ${msg}`);
const fail = (msg: string) => console.log(`  ❌ ${msg}`);
const section = (n: number, title: string) => console.log(`\n── [${n}] ${title} ──────────────────`);

// ─── 1. Supabase connection ────────────────────────────────────────────────
section(1, "Supabase connection");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
pass(`URL: ${SUPABASE_URL}`);
pass("Service role client created");

// ─── 2. Read/write test ────────────────────────────────────────────────────
section(2, "Read/write to database");
const { data: tables, error: tablesErr } = await admin
  .from("items")
  .select("id")
  .limit(1);
if (tablesErr) {
  fail(`Cannot read 'items' table: ${tablesErr.message}`);
  process.exit(1);
}
pass("Can read 'items' table");

const { data: cols, error: colsErr } = await admin
  .from("collections")
  .select("id")
  .limit(1);
if (colsErr) {
  fail(`Cannot read 'collections' table: ${colsErr.message}`);
} else {
  pass("Can read 'collections' table");
}

// ─── 3. Create test user & get token ──────────────────────────────────────
section(3, "Create test user + get session token");
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});
if (createErr || !created.user) {
  fail(`Could not create test user: ${createErr?.message}`);
  process.exit(1);
}
const TEST_USER_ID = created.user.id;
pass(`Test user created: ${TEST_EMAIL} (${TEST_USER_ID})`);

// Sign in to get a valid JWT
const anonClient = createClient(SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});
const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signInErr || !session.session) {
  fail(`Sign-in failed: ${signInErr?.message}`);
  await admin.auth.admin.deleteUser(TEST_USER_ID);
  process.exit(1);
}
const ACCESS_TOKEN = session.session.access_token;
pass("Session token obtained");

// ─── 4. Save a basic URL via the API ──────────────────────────────────────
section(4, "Save a basic URL (https://bbc.com/news)");
const basicRes = await fetch(`http://localhost:5000/api/public/share/save`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  },
  body: JSON.stringify({ url: "https://www.bbc.com/news", share_source: "pwa_share" }),
});
const basicJson = await basicRes.json();
if (!basicRes.ok || !basicJson.ok) {
  fail(`API returned ${basicRes.status}: ${JSON.stringify(basicJson)}`);
} else {
  pass(`Saved → ID: ${basicJson.item?.id}`);
  pass(`Title: "${basicJson.item?.title}"`);
  pass(`Category: ${basicJson.item?.category}`);
  pass(`Status: ${basicJson.item?.processing_status}`);
}

// ─── 5. Save an Instagram Reel ────────────────────────────────────────────
section(5, "Save an Instagram recipe Reel");
const igUrl = "https://www.instagram.com/reel/C8tJ3oPsrQP/";
const igRes = await fetch(`http://localhost:5000/api/public/share/save`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  },
  body: JSON.stringify({
    url: igUrl,
    share_source: "pwa_share",
    context_type: "recipe",
  }),
});
const igJson = await igRes.json();
let igItemId: string | null = null;
if (!igRes.ok || !igJson.ok) {
  fail(`Instagram save returned ${igRes.status}: ${JSON.stringify(igJson)}`);
} else {
  igItemId = igJson.item?.id;
  pass(`Saved → ID: ${igItemId}`);
  pass(`Title: "${igJson.item?.title}"`);
  pass(`Status: ${igJson.item?.processing_status}`);
  pass(`ai_status: ${igJson.ai_status}`);
}

// ─── 6. AI categorization check ───────────────────────────────────────────
section(6, "AI categorization");
if (!OPENAI_API_KEY) {
  fail("OPENAI_API_KEY not set — skipping");
} else {
  const testAi = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with just the word: PONG" }],
      max_tokens: 5,
    }),
  });
  if (testAi.ok) {
    const tj = await testAi.json();
    pass(`OpenAI gpt-4o-mini reachable: "${tj.choices?.[0]?.message?.content?.trim()}"`);
  } else {
    fail(`OpenAI API error: ${testAi.status}`);
  }

  // Check if the basic URL item got categorized
  if (basicJson.item?.id) {
    const { data: item } = await admin
      .from("items")
      .select("category, subcategory, tags, ai_summary, confidence_score, processing_status")
      .eq("id", basicJson.item.id)
      .single();
    if (item) {
      pass(`Category: ${item.category}`);
      pass(`Subcategory: ${item.subcategory ?? "(none)"}`);
      pass(`Tags: ${(item.tags ?? []).join(", ") || "(none)"}`);
      pass(`Summary: "${item.ai_summary ?? "(none)"}"`);
      pass(`Confidence: ${item.confidence_score ?? "(none)"}`);
      pass(`Processing status: ${item.processing_status}`);
    } else {
      fail("Could not fetch item from DB for AI check");
    }
  }
}

// ─── 7. Transcript / caption extraction ───────────────────────────────────
section(7, "Transcript/caption extraction");
if (igItemId) {
  const { data: igItem } = await admin
    .from("items")
    .select("transcript, original_caption, source_platform, processing_status")
    .eq("id", igItemId)
    .single();
  if (igItem) {
    if (igItem.transcript) {
      pass(`Transcript extracted (${igItem.transcript.length} chars): "${igItem.transcript.slice(0, 100)}…"`);
    } else {
      console.log("  ⚠️  No transcript (Instagram requires Firecrawl — expected if FIRECRAWL_API_KEY not set)");
    }
    if (igItem.original_caption) {
      pass(`Caption: "${igItem.original_caption.slice(0, 120)}"`);
    } else {
      console.log("  ⚠️  No caption extracted");
    }
    pass(`Platform detected: ${igItem.source_platform}`);
    pass(`Processing status: ${igItem.processing_status}`);
  } else {
    fail("Could not fetch Instagram item from DB");
  }
} else {
  console.log("  ⚠️  Skipped (Instagram save failed above)");
}

// ─── 8. Embeddings check ──────────────────────────────────────────────────
section(8, "Embeddings");
if (basicJson.item?.id) {
  // Give it a moment if needed
  await Bun.sleep(500);
  const { data: embItem } = await admin
    .from("items")
    .select("embedding, embedding_updated_at")
    .eq("id", basicJson.item.id)
    .single();
  if (embItem?.embedding) {
    const vec = embItem.embedding as number[];
    pass(`Embedding created: ${vec.length}-dim vector`);
    pass(`Updated at: ${embItem.embedding_updated_at}`);
  } else {
    fail("No embedding found — OpenAI embed call may have failed");
  }
}

// ─── 9. Ask My STASHd (semantic search) ───────────────────────────────────
section(9, "Ask My STASHd (semantic search via match_items)");
// Embed the question
const qRes = await fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "text-embedding-3-small", input: "latest news" }),
});
if (qRes.ok) {
  const qj = await qRes.json();
  const vec = qj.data?.[0]?.embedding;
  if (vec) {
    const { data: matches, error: matchErr } = await admin.rpc("match_items", {
      query_embedding: vec,
      match_threshold: 0.0,
      match_count: 5,
      p_user_id: TEST_USER_ID,
    });
    if (matchErr) {
      fail(`match_items RPC error: ${matchErr.message}`);
    } else {
      pass(`match_items RPC works — ${(matches ?? []).length} result(s) returned`);
      for (const m of (matches ?? []).slice(0, 3)) {
        console.log(`    → "${m.title}" (similarity: ${m.similarity?.toFixed(3)})`);
      }
    }
  }
} else {
  fail(`Embedding for search failed: ${qRes.status}`);
}

// ─── Cleanup ───────────────────────────────────────────────────────────────
section(0, "Cleanup");
// Delete test items
await admin.from("items").delete().eq("user_id", TEST_USER_ID);
// Delete test user
await admin.auth.admin.deleteUser(TEST_USER_ID);
pass("Test user and items cleaned up");

console.log("\n══════════════════════════════════════════");
console.log("  Verification complete.");
console.log("══════════════════════════════════════════\n");
