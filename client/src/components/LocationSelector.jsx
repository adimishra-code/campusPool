import { useState, useRef, useEffect, useMemo } from "react";
import { GBU_PLACES, CATEGORY_LABELS, GBU_CENTER } from "../constants/places.js";

/**
 * Searchable location selector with GBU campus presets and smart "One-Anchor" custom typing.
 *
 * Props:
 * - label: "From (Pickup)" | "To (Destination)"
 * - value: { id?, label?, address?, coordinates?, isCustom? }
 * - onChange: (placeObject) => void
 * - lockedToCampus: boolean (if true, user CANNOT type a custom outside address because the other end is already custom)
 * - lockReason: helper string explaining the lock
 */
export default function LocationSelector({
  label,
  value,
  onChange,
  lockedToCampus = false,
  lockReason = "One point must be an official GBU Campus location",
  allowAnywhere = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(Boolean(value?.isCustom));
  const [customText, setCustomText] = useState(value?.isCustom ? value.address || "" : "");
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter available places
  const filteredPlaces = useMemo(() => {
    // If locked to campus, only show places where isCampus is true
    const baseList = lockedToCampus
      ? GBU_PLACES.filter((p) => p.isCampus)
      : GBU_PLACES;

    if (!search.trim()) return baseList;
    const q = search.toLowerCase();
    return baseList.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [search, lockedToCampus]);

  // Group filtered places by category
  const groupedPlaces = useMemo(() => {
    const groups = {};
    for (const place of filteredPlaces) {
      if (!groups[place.category]) groups[place.category] = [];
      groups[place.category].push(place);
    }
    return groups;
  }, [filteredPlaces]);

  const handleSelectPreset = (place) => {
    setIsCustomMode(false);
    setCustomText("");
    setSearch("");
    setIsOpen(false);
    onChange({
      id: place.id,
      label: place.label,
      address: place.address,
      coordinates: place.coordinates,
      category: place.category,
      isCampus: place.isCampus,
      isCustom: false
    });
  };

  const handleSelectAnywhere = () => {
    setIsCustomMode(false);
    setCustomText("");
    setSearch("");
    setIsOpen(false);
    onChange(null);
  };

  const handleEnableCustom = () => {
    if (lockedToCampus) return;
    setIsCustomMode(true);
    setIsOpen(false);
    const initialText = customText || "";
    onChange({
      id: "custom-" + Date.now(),
      label: initialText || "Custom Location",
      address: initialText,
      coordinates: GBU_CENTER, // Anchor close to GBU for fare estimate
      isCampus: false,
      isCustom: true
    });
  };

  const handleCustomTextChange = (e) => {
    const text = e.target.value;
    setCustomText(text);
    onChange({
      id: "custom-" + Date.now(),
      label: text || "Custom Location",
      address: text,
      coordinates: GBU_CENTER,
      isCampus: false,
      isCustom: true
    });
  };

  const handleBackToPresets = () => {
    setIsCustomMode(false);
    setCustomText("");
    // Default to GBU Gate 1
    const defaultPlace = GBU_PLACES[0];
    handleSelectPreset(defaultPlace);
  };

  return (
    <div className="location-selector" ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{label}</span>
        {lockedToCampus && (
          <span
            style={{
              fontSize: "0.72rem",
              background: "rgba(220, 38, 38, 0.1)",
              color: "#dc2626",
              padding: "2px 8px",
              borderRadius: "12px",
              fontWeight: 500
            }}
            title={lockReason}
          >
            🔒 Campus Locked
          </span>
        )}
      </div>

      {isCustomMode && !lockedToCampus ? (
        /* Custom Typing Mode */
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              className="field-input"
              value={customText}
              onChange={handleCustomTextChange}
              placeholder="Type address, sector, metro (e.g. Noida Sec 51)..."
              autoFocus
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "2px solid #3b82f6",
                fontSize: "0.9rem"
              }}
            />
            <button
              type="button"
              onClick={handleBackToPresets}
              style={{
                padding: "0 12px",
                background: "var(--color-bg-secondary, #f1f5f9)",
                border: "1px solid var(--color-border, #cbd5e1)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.8rem",
                whiteSpace: "nowrap"
              }}
              title="Pick from GBU locations instead"
            >
              List
            </button>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #64748b)" }}>
            ✏️ Custom address outside campus. The other location will be locked to GBU.
          </span>
        </div>
      ) : (
        /* Preset Dropdown Search Mode */
        <div>
          <div
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border, #cbd5e1)",
              background: "var(--color-bg-card, #ffffff)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.9rem"
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value?.label || (allowAnywhere ? "Anywhere" : lockedToCampus ? "Select GBU campus location..." : "Search GBU or nearby location...")}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: 8 }}>▼</span>
          </div>

          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                background: "var(--color-bg-card, #ffffff)",
                border: "1px solid var(--color-border, #cbd5e1)",
                borderRadius: "8px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                zIndex: 100,
                maxHeight: "320px",
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Search filter input */}
              <div style={{ padding: "8px", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={lockedToCampus ? "Filter GBU campus points..." : "Type to filter locations..."}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border, #cbd5e1)",
                    fontSize: "0.85rem",
                    boxSizing: "border-box"
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Locations List */}
              <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
                {allowAnywhere && (
                  <div
                    onClick={handleSelectAnywhere}
                    style={{
                      padding: "8px 12px",
                      fontSize: "0.86rem",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border, #e2e8f0)",
                      fontWeight: !value ? 600 : 400,
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <span>🌐</span>
                    <span>Anywhere (All locations)</span>
                  </div>
                )}
                {Object.keys(groupedPlaces).length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", fontSize: "0.85rem", color: "#64748b" }}>
                    No matching locations found.
                  </div>
                ) : (
                  Object.entries(groupedPlaces).map(([catKey, places]) => (
                    <div key={catKey}>
                      <div
                        style={{
                          padding: "6px 12px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          color: "#64748b",
                          background: "var(--color-bg-secondary, #f8fafc)"
                        }}
                      >
                        {CATEGORY_LABELS[catKey] || catKey}
                      </div>
                      {places.map((place) => (
                        <div
                          key={place.id}
                          onClick={() => handleSelectPreset(place)}
                          style={{
                            padding: "8px 12px",
                            fontSize: "0.86rem",
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(0,0,0,0.03)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: value?.id === place.id ? "rgba(59, 130, 246, 0.08)" : "transparent"
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59, 130, 246, 0.06)")}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              value?.id === place.id ? "rgba(59, 130, 246, 0.08)" : "transparent")
                          }
                        >
                          <span>{place.isCampus ? "🎓" : place.category === "metro_transit" ? "🚇" : "📍"}</span>
                          <span style={{ fontWeight: value?.id === place.id ? 600 : 400 }}>{place.label}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Custom Location Option at bottom */}
              {!lockedToCampus ? (
                <div
                  onClick={handleEnableCustom}
                  style={{
                    padding: "10px 12px",
                    borderTop: "1px solid var(--color-border, #e2e8f0)",
                    background: "rgba(59, 130, 246, 0.04)",
                    color: "#2563eb",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(59, 130, 246, 0.04)")}
                >
                  <span>✏️</span>
                  <span>Type a custom address outside campus...</span>
                </div>
              ) : (
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "1px solid var(--color-border, #e2e8f0)",
                    background: "rgba(220, 38, 38, 0.04)",
                    color: "#b91c1c",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    textAlign: "center"
                  }}
                >
                  🔒 Locked to GBU Campus because the other point is custom-typed
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
