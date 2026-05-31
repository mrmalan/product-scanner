import { useState, useRef, useCallback } from "react";
import "./App.css";

const STORES = [
  { name: "Takealot", query: "site:takealot.com" },
  { name: "Superbalist", query: "site:superbalist.com" },
  { name: "Zara", query: "site:zara.com" },
  { name: "H&M", query: "site:hm.com" },
  { name: "Mr Price", query: "site:mrpricegroup.com" },
  { name: "All stores", query: "" },
];

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

async function identifyProduct(base64Image, mediaType) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Image },
            },
            {
              type: "text",
              text: `You are a product identification expert for online shopping. Analyse this product image and respond ONLY with a JSON object (no markdown, no backticks) with these fields:
{
  "productType": "e.g. T-shirt, sneakers, handbag",
  "brand": "brand name if visible, or null",
  "color": "primary color(s)",
  "style": "e.g. oversized, slim fit, floral print",
  "material": "if determinable, e.g. cotton, denim",
  "keyFeatures": ["list", "of", "notable", "features"],
  "searchQuery": "optimised search query for finding this product online, 5-10 words",
  "alternativeQueries": ["2-3 alternative search queries for variations"],
  "confidence": "high/medium/low"
}`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function searchProducts(query, store) {
  const fullQuery = store.query
    ? `${query} ${store.query}`
    : `buy online ${query} South Africa`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `Search for: "${fullQuery}". Find the top 3 online shopping results. Return ONLY a JSON array (no markdown) like:
[{"title":"product name","store":"store name","price":"price if available or null","url":"product URL","snippet":"short description"}]`,
        },
      ],
    }),
  });

  const data = await response.json();
  const textBlocks =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "[]";
  try {
    const clean = textBlocks.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

export default function ProductScanner() {
  const [phase, setPhase] = useState("idle");
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState(null);
  const [product, setProduct] = useState(null);
  const [selectedStore, setSelectedStore] = useState(STORES[5]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImage(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      setImageMediaType(file.type);
      setPhase("idle");
      setProduct(null);
      setResults([]);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleScan = async () => {
    if (!imageBase64) return;
    setPhase("scanning");
    setError(null);
    try {
      const identified = await identifyProduct(imageBase64, imageMediaType);
      setProduct(identified);
      setPhase("identified");
    } catch {
      setError("Could not identify product. Try a clearer image.");
      setPhase("idle");
    }
  };

  const handleSearch = async () => {
    if (!product) return;
    setPhase("searching");
    setResults([]);
    try {
      const res = await searchProducts(product.searchQuery, selectedStore);
      setResults(res);
      setPhase("results");
    } catch {
      setError("Search failed. Please try again.");
      setPhase("identified");
    }
  };

  const reset = () => {
    setImage(null);
    setImageBase64(null);
    setProduct(null);
    setResults([]);
    setError(null);
    setPhase("idle");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f0ece4", fontFamily: "'Georgia', serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 20px" }}>

        <div style={{ marginBottom: 48, borderBottom: "1px solid #1e1c18", paddingBottom: 32 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#c9a96e", textTransform: "uppercase" }}>
            ◆ Product Scanner
          </span>
          <h1 className="headline" style={{ fontSize: 40, fontWeight: 400, marginTop: 8, lineHeight: 1.15 }}>
            Find it cheaper,<br /><em>somewhere else.</em>
          </h1>
          <p style={{ marginTop: 12, color: "#666", fontSize: 14, lineHeight: 1.6, fontFamily: "'IBM Plex Mono', monospace" }}>
            Photograph any product · AI identifies it · searches the web for alternatives
          </p>
        </div>

        <div
          className={`drop-zone ${dragOver ? "active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => processFile(e.target.files[0])}
          />
          {image ? (
            <div>
              <img src={image} alt="Product" style={{ maxHeight: 240, maxWidth: "100%", borderRadius: 2, objectFit: "contain" }} />
              <p className="mono" style={{ marginTop: 12, color: "#666", fontSize: 11 }}>click to change image</p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⬆</div>
              <p className="headline" style={{ fontSize: 18, color: "#888", fontStyle: "italic" }}>Drop a product photo here</p>
              <p className="mono" style={{ fontSize: 11, color: "#555", marginTop: 6 }}>or click to browse files</p>
            </div>
          )}
        </div>

        {error && (
          <p className="mono" style={{ color: "#e05c5c", fontSize: 11, marginTop: 12, padding: "10px 14px", background: "#120808", border: "1px solid #3a1010", borderRadius: 3 }}>
            ⚠ {error}
          </p>
        )}

        {image && phase === "idle" && (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleScan}>Identify Product</button>
            <button className="btn btn-ghost" onClick={reset}>Clear</button>
          </div>
        )}

        {phase === "scanning" && (
          <div style={{ marginTop: 20, padding: "16px 20px", background: "#111", border: "1px solid #1e1c18", borderRadius: 4 }}>
            <span className="spinner" />
            <span className="mono" style={{ fontSize: 11, color: "#888" }}>Analysing product with AI vision…</span>
          </div>
        )}

        {product && (phase === "identified" || phase === "searching" || phase === "results") && (
          <>
            <hr className="divider" />
            <span className="tag">Identified Product</span>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <h2 className="headline" style={{ fontSize: 22, fontWeight: 400 }}>
                    {product.brand ? `${product.brand} ` : ""}{product.productType}
                  </h2>
                  <p className="mono" style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    {product.color} · {product.style}{product.material ? ` · ${product.material}` : ""}
                  </p>
                </div>
                <span className="mono" style={{
                  fontSize: 10, padding: "4px 10px", borderRadius: 20, border: "1px solid",
                  borderColor: product.confidence === "high" ? "#4a7c59" : product.confidence === "medium" ? "#7c6a2a" : "#7c3a2a",
                  color: product.confidence === "high" ? "#6ab87a" : product.confidence === "medium" ? "#c9a040" : "#e05c5c",
                }}>
                  <span className="confidence-dot" style={{
                    background: product.confidence === "high" ? "#6ab87a" : product.confidence === "medium" ? "#c9a040" : "#e05c5c"
                  }} />
                  {product.confidence}
                </span>
              </div>

              {product.keyFeatures?.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {product.keyFeatures.map((f, i) => (
                    <span key={i} className="mono" style={{ fontSize: 10, padding: "3px 8px", background: "#1a1610", border: "1px solid #2a2520", borderRadius: 2, color: "#888" }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16, padding: "10px 14px", background: "#0d0d0a", borderRadius: 3, border: "1px solid #2a2520" }}>
                <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: "#666", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Search Query</span>
                <span className="mono" style={{ fontSize: 12, color: "#c9a96e" }}>"{product.searchQuery}"</span>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <span className="tag">Search In</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {STORES.map((s) => (
                  <span key={s.name} className={`pill ${selectedStore.name === s.name ? "selected" : ""}`} onClick={() => setSelectedStore(s)}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>

            {phase === "identified" && (
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button className="btn btn-primary" onClick={handleSearch}>Search for Alternatives</button>
                <button className="btn btn-ghost" onClick={reset}>Start Over</button>
              </div>
            )}

            {phase === "searching" && (
              <div style={{ marginTop: 16, padding: "16px 20px", background: "#111", border: "1px solid #1e1c18", borderRadius: 4 }}>
                <span className="spinner" />
                <span className="mono" style={{ fontSize: 11, color: "#888" }}>Searching {selectedStore.name}…</span>
              </div>
            )}
          </>
        )}

        {phase === "results" && (
          <>
            <hr className="divider" />
            <span className="tag">Shopping Results — {selectedStore.name}</span>

            {results.length === 0 ? (
              <p className="mono" style={{ fontSize: 12, color: "#666", padding: "20px 0" }}>No results found. Try a different store or search term.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                {results.map((r, i) => (
                  <div key={i} className="card" style={{ position: "relative" }}>
                    <span className="mono" style={{ position: "absolute", top: 14, right: 16, fontSize: 10, color: "#555" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div style={{ paddingRight: 30 }}>
                      <p className="headline" style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.3 }}>{r.title}</p>
                      <p className="mono" style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{r.store}</p>
                      {r.price && <p className="mono" style={{ fontSize: 13, color: "#c9a96e", marginTop: 6 }}>{r.price}</p>}
                      {r.snippet && <p style={{ fontSize: 12, color: "#666", marginTop: 8, lineHeight: 1.5 }}>{r.snippet}</p>}
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="result-link" style={{ marginTop: 10, display: "inline-block" }}>
                          View Product →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {product?.alternativeQueries?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <span className="tag">Try Also</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {product.alternativeQueries.map((q, i) => (
                    <span key={i} className="pill" onClick={() => { setProduct({ ...product, searchQuery: q }); setPhase("identified"); }}>
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={handleSearch}>Search Again</button>
              <button className="btn btn-ghost" onClick={reset}>New Scan</button>
            </div>
          </>
        )}

        <div style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #1a1810" }}>
          <p className="mono" style={{ fontSize: 10, color: "#444", lineHeight: 1.6 }}>
            Powered by Claude Vision + Web Search · Results sourced live from the web
          </p>
        </div>
      </div>
    </div>
  );
}
