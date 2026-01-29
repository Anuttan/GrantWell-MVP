import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { LuFileX } from "react-icons/lu";
import { NOFO, GRANT_TYPES, GrantTypeId } from "../Dashboard";
import { Utils } from "../../common/utils";
import { addToRecentlyViewed } from "../../utils/recently-viewed-nofos";
import "../../styles/landing-page-table.css";

interface GrantsTableProps {
  nofos: NOFO[];
  loading: boolean;
  onSelectDocument: (document: { label: string; value: string }) => void;
  onSearchTermChange?: (term: string) => void;
  selectedDocument: { label: string; value: string } | null;
  highlightCTAButtons?: boolean;
  onHighlightCTAButtons?: (highlight: boolean) => void;
}

export const GrantsTable: React.FC<GrantsTableProps> = ({ 
  nofos, 
  loading, 
  onSelectDocument, 
  onSearchTermChange,
  selectedDocument,
  highlightCTAButtons = false,
  onHighlightCTAButtons
}) => {
  const navigate = useNavigate();
  const firstCTAButtonRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const uniqueCategories = Array.from(
    new Set(nofos.map((nofo) => nofo.category).filter((category): category is string => !!category))
  ).sort();

  // Calculate grant count per category
  const getCategoryCount = (category: string) => {
    return nofos.filter((nofo) => nofo.category === category).length;
  };

  // Calculate grant count per status
  const getStatusCount = (status: "active" | "archived") => {
    return nofos.filter((nofo) => nofo.status === status).length;
  };

  // Calculate grant count per grant type
  const getGrantTypeCount = (grantType: GrantTypeId) => {
    return nofos.filter((nofo) => nofo.grantType === grantType).length;
  };

  // Filter NOFOs based on search query and filters
  const getFilteredNofos = () => {
    let filtered = nofos.filter((nofo) => {
      // Search query filter
      const matchesSearch = searchQuery.trim() === "" || 
        nofo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (nofo.agency && nofo.agency.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (nofo.category && nofo.category.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Status filter
      const matchesStatus = statusFilter === "all" || nofo.status === statusFilter;
      
      // Category filter
      const matchesCategory = categoryFilter === "all" || nofo.category === categoryFilter;
      
      // Grant type filter
      const matchesGrantType = grantTypeFilter === "all" || nofo.grantType === grantTypeFilter;

      return matchesSearch && matchesStatus && matchesCategory && matchesGrantType;
    });

    // Sort: pinned first, then alphabetically
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return filtered;
  };

  const filteredNofos = getFilteredNofos();
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredNofos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedNofos = filteredNofos.slice(startIndex, endIndex);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, grantTypeFilter, searchQuery]);
  
  // Update parent search term when search query changes
  useEffect(() => {
    if (onSearchTermChange) {
      onSearchTermChange(searchQuery);
    }
  }, [searchQuery, onSearchTermChange]);
  
  // Sync search bar with selected document
  useEffect(() => {
    if (selectedDocument && selectedDocument.label) {
      // Only update if the search query doesn't already match
      if (searchQuery !== selectedDocument.label) {
        setSearchQuery(selectedDocument.label);
      }
    }
  }, [selectedDocument]);

  // Handle row click to select document (same as search bar)
  const handleRowClick = (nofo: NOFO) => {
    const selectedDoc = {
      label: nofo.name,
      value: nofo.name + "/",
    };
    
    // Update filters to match the selected grant
    if (nofo.status) {
      setStatusFilter(nofo.status);
    }
    if (nofo.category) {
      setCategoryFilter(nofo.category);
    }
    if (nofo.grantType) {
      setGrantTypeFilter(nofo.grantType);
    }
    
    // Update the search query with the grant name
    setSearchQuery(nofo.name);
    
    // Update parent search term
    if (onSearchTermChange) {
      onSearchTermChange(nofo.name);
    }
    
    // Then select the document (this will show CTA buttons)
    onSelectDocument(selectedDoc);
    
    // Highlight CTA buttons and scroll to them
    if (onHighlightCTAButtons) {
      onHighlightCTAButtons(true);
      setTimeout(() => {
        onHighlightCTAButtons(false);
      }, 2000);
    }
    
    // Scroll to CTA buttons after state updates complete
    setTimeout(() => {
      if (firstCTAButtonRef.current) {
        firstCTAButtonRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        firstCTAButtonRef.current.focus();
      }
    }, 150);
  };
  
  // Handle NOFO selection for navigation
  const handleNOFOSelect = (href: string, selectedNOFO: { label: string; value: string }) => {
    const updatedHistory = addToRecentlyViewed(selectedNOFO);
    navigate(href);
  };
  
  // Handle clearing the search and selection
  const handleClearSearch = () => {
    setSearchQuery("");
    onSelectDocument(null);
    if (onSearchTermChange) {
      onSearchTermChange("");
    }
    if (onHighlightCTAButtons) {
      onHighlightCTAButtons(false);
    }
  };

  if (loading) {
    return (
      <div className="landing-table-loading">
        <p>Loading grants...</p>
      </div>
    );
  }

  return (
    <div className="landing-grants-table-container">
      {/* Search Bar */}
      <div className="landing-table-search-wrapper" style={{ marginBottom: "20px" }}>
        <label htmlFor="grant-table-search" className="landing-filter-label" style={{ marginBottom: "8px", display: "block" }}>
          Search grants
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="grant-table-search"
            type="text"
            placeholder="Search by grant name, agency, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="landing-table-search-input"
            style={{
              width: "100%",
              padding: "10px 40px 10px 40px",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              fontSize: "14px",
              transition: "all 0.2s ease",
            }}
            onFocus={(e) => {
              e.target.style.outline = "none";
              e.target.style.borderColor = "#14558F";
              e.target.style.boxShadow = "0 0 0 3px rgba(20, 85, 143, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e0e0e0";
              e.target.style.boxShadow = "none";
            }}
            aria-label="Search grants by name, agency, or category"
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <path
              d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z"
              stroke="#14558F"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.5 10.5L14 14"
              stroke="#14558F"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* Clear button (X) */}
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search and selection"
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f0f0f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #0088FF";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.backgroundColor = "#f0f0f0";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 4L4 12M4 4L12 12"
                  stroke="#666"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* CTA Buttons - shown when grant is selected */}
      {selectedDocument && (
        <nav
          aria-label="Grant actions"
          className={`cta-buttons-container${highlightCTAButtons ? " highlight" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "10px",
            margin: highlightCTAButtons ? "0 0 20px 0" : "0 0 20px 0",
            width: "100%",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            ref={firstCTAButtonRef}
            onClick={() => {
              handleNOFOSelect(
                `/requirements/${encodeURIComponent(
                  selectedDocument.value
                )}`,
                selectedDocument
              );
            }}
            style={{
              background: "#14558F",
              color: "white",
              border: "none",
              borderRadius: "20px",
              padding: "10px 22px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
              minWidth: "180px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#104472";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#14558F";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
              e.currentTarget.style.boxShadow =
                "0 0 0 4px rgba(44, 79, 219, 0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.outlineOffset = "0px";
              e.currentTarget.style.boxShadow = "none";
            }}
            aria-label="View Key Requirements"
          >
            View Key Requirements
          </button>

          <button
            onClick={() => {
              // Track the NOFO as recently viewed before navigating to document editor
              addToRecentlyViewed(selectedDocument);

              // Navigate to document editor
              window.location.href = `/document-editor?nofo=${encodeURIComponent(
                selectedDocument.value
              )}`;
            }}
            style={{
              background: "#14558F",
              color: "white",
              border: "none",
              borderRadius: "20px",
              padding: "10px 22px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
              minWidth: "180px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#104472";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#14558F";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
              e.currentTarget.style.boxShadow =
                "0 0 0 4px rgba(44, 79, 219, 0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.outlineOffset = "0px";
              e.currentTarget.style.boxShadow = "none";
            }}
            aria-label="Write Project Narrative"
          >
            Write Project Narrative
          </button>

          <button
            onClick={() => {
              // Track the NOFO as recently viewed before navigating to chatbot
              addToRecentlyViewed(selectedDocument);

              // Navigate to chatbot
              const newSessionId = uuidv4();
              window.location.href = `/chat/${newSessionId}?folder=${encodeURIComponent(
                selectedDocument.value
              )}`;
            }}
            style={{
              background: "#14558F",
              color: "white",
              border: "none",
              borderRadius: "20px",
              padding: "10px 22px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
              minWidth: "180px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#104472";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#14558F";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
              e.currentTarget.style.boxShadow =
                "0 0 0 4px rgba(44, 79, 219, 0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.outlineOffset = "0px";
              e.currentTarget.style.boxShadow = "none";
            }}
            aria-label="Get Grant Help"
          >
            Get Grant Help
          </button>
        </nav>
      )}

      {/* Filter Dropdowns */}
      <div className="landing-table-filters">
        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="status-filter" className="landing-filter-label">Status</label>
          <select
            id="status-filter"
            className="landing-filter-dropdown"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "archived")}
          >
            <option value="all">All Grants ({nofos.length})</option>
            <option value="active">Active ({getStatusCount("active")})</option>
            <option value="archived">Archived ({getStatusCount("archived")})</option>
          </select>
        </div>

        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="category-filter" className="landing-filter-label">Category</label>
          <select
            id="category-filter"
            className="landing-filter-dropdown"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map((category) => {
              const count = getCategoryCount(category);
              return (
                <option key={category} value={category}>
                  {category} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="grant-type-filter" className="landing-filter-label">Grant Type</label>
          <select
            id="grant-type-filter"
            className="landing-filter-dropdown"
            value={grantTypeFilter}
            onChange={(e) => setGrantTypeFilter(e.target.value as GrantTypeId | "all")}
          >
            <option value="all">All Grant Types</option>
            {Object.keys(GRANT_TYPES).map((type) => {
              const grantType = type as GrantTypeId;
              const count = getGrantTypeCount(grantType);
              return (
                <option key={type} value={type}>
                  {GRANT_TYPES[grantType].label} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="landing-table-container">
        <div className="landing-table-header">
          <div className="landing-header-cell">Name</div>
          <div className="landing-header-cell">Agency</div>
          <div className="landing-header-cell">Category</div>
          <div className="landing-header-cell">Type</div>
          <div className="landing-header-cell">Expiry Date</div>
        </div>

        <div className="landing-table-body">
          {filteredNofos.length === 0 && (
            <div className="landing-no-data">
              <LuFileX size={24} className="landing-no-data-icon" />
              <p>No grants found matching your filters</p>
            </div>
          )}
          {paginatedNofos.map((nofo, index) => {
            const isArchived = nofo.status === "archived";
            return (
              <div
                key={nofo.id || index}
                className={`landing-table-row ${isArchived ? "archived" : ""}`}
                onClick={() => !isArchived && handleRowClick(nofo)}
                style={{
                  cursor: isArchived ? "not-allowed" : "pointer",
                  opacity: isArchived ? 0.7 : 1,
                  backgroundColor: isArchived ? "#f9f9f9" : undefined,
                }}
                aria-label={isArchived ? `${nofo.name} (Expired - no longer accepting applications)` : `Select ${nofo.name}`}
                aria-disabled={isArchived}
              >
                <div className="landing-row-cell">
                  <span className="landing-nofo-name" style={{ color: isArchived ? "#888" : undefined }}>
                    {nofo.name}
                  </span>
                  {isArchived && (
                    <span
                      className="landing-expired-badge"
                      title="This grant has expired and is no longer accepting applications"
                    >
                      Expired
                    </span>
                  )}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.agency || <span className="landing-no-value">N/A</span>}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.category || <span className="landing-no-value">N/A</span>}
                </div>
                <div className="landing-row-cell">
                  {nofo.grantType && GRANT_TYPES[nofo.grantType] ? (
                    <span
                      className="landing-grant-type-badge"
                      style={{
                        backgroundColor: `${GRANT_TYPES[nofo.grantType].color}15`,
                        color: GRANT_TYPES[nofo.grantType].color,
                        borderColor: `${GRANT_TYPES[nofo.grantType].color}40`,
                        opacity: isArchived ? 0.6 : 1,
                      }}
                    >
                      {GRANT_TYPES[nofo.grantType].label}
                    </span>
                  ) : (
                    <span className="landing-grant-type-badge unset" style={{ opacity: isArchived ? 0.6 : 1 }}>Unset</span>
                  )}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.expirationDate ? (
                    <span className="landing-expiry-date">
                      {Utils.formatExpirationDate(nofo.expirationDate)}
                    </span>
                  ) : (
                    <span className="landing-expiry-date no-date">N/A</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {filteredNofos.length > 0 && totalPages > 1 && (
        <div className="landing-table-pagination">
          <div className="landing-pagination-info">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredNofos.length)} of {filteredNofos.length} grants
          </div>
          <div className="landing-pagination-controls">
            <button
              className="landing-pagination-button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <div className="landing-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      className={`landing-pagination-page ${currentPage === page ? "active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Go to page ${page}`}
                      aria-current={currentPage === page ? "page" : undefined}
                    >
                      {page}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <span key={page} className="landing-pagination-ellipsis">
                      ...
                    </span>
                  );
                }
                return null;
              })}
            </div>
            <button
              className="landing-pagination-button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
