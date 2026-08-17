import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");

describe("My Commutes navigation and state restoration", () => {
  it("preserves sort, network filter, selected legs, expanded stops, and disclosures across navigation in LineWatchShell", () => {
    assert.match(shellSource, /const \[commutesSortBy, setCommutesSortBy\] = useState<SavedCommuteSort>\("impact"\);/);
    assert.match(shellSource, /const \[commutesNetworkFilter, setCommutesNetworkFilter\] = useState<AccountNetworkFilter>\("all"\);/);
    assert.match(shellSource, /const \[commutesSelectedLegIds, setCommutesSelectedLegIds\] = useState<Record<string, AccountCommuteLegId>>\(\{\}\);/);
    assert.match(shellSource, /const \[commutesExpandedCommuteId, setCommutesExpandedCommuteId\] = useState<string \| null>\(null\);/);
    assert.match(shellSource, /const \[commutesExpandedImpactDisclosures, setCommutesExpandedImpactDisclosures\]/);
    assert.match(shellSource, /handleCommutesToggleImpactDisclosure/);

    assert.match(shellSource, /sortBy=\{commutesSortBy\}/);
    assert.match(shellSource, /onSortByChange=\{setCommutesSortBy\}/);
    assert.match(shellSource, /networkFilter=\{commutesNetworkFilter\}/);
    assert.match(shellSource, /onNetworkFilterChange=\{setCommutesNetworkFilter\}/);
    assert.match(shellSource, /selectedLegIds=\{commutesSelectedLegIds\}/);
    assert.match(shellSource, /onSelectedLegIdsChange=\{setCommutesSelectedLegIds\}/);
    assert.match(shellSource, /expandedCommuteId=\{commutesExpandedCommuteId\}/);
    assert.match(shellSource, /onExpandedCommuteIdChange=\{setCommutesExpandedCommuteId\}/);
    assert.match(shellSource, /expandedImpactDisclosures=\{commutesExpandedImpactDisclosures\}/);
    assert.match(shellSource, /onToggleImpactDisclosure=\{handleCommutesToggleImpactDisclosure\}/);
  });

  it("supports controlled state props in SavedCommutesPanel", () => {
    assert.match(panelSource, /sortBy\?: SavedCommuteSort;/);
    assert.match(panelSource, /onSortByChange\?: \(sort: SavedCommuteSort\) => void;/);
    assert.match(panelSource, /networkFilter\?: AccountNetworkFilter;/);
    assert.match(panelSource, /onNetworkFilterChange\?: \(filter: AccountNetworkFilter\) => void;/);
    assert.match(panelSource, /selectedLegIds\?: Record<string, AccountCommuteLegId>;/);
    assert.match(panelSource, /onSelectedLegIdsChange\?:/);
    assert.match(panelSource, /expandedCommuteId\?: string \| null;/);
    assert.match(panelSource, /onExpandedCommuteIdChange\?:/);
    assert.match(panelSource, /expandedImpactDisclosures\?: Record<string, boolean>;/);
    assert.match(panelSource, /onToggleImpactDisclosure\?: \(key: string, isOpen: boolean\) => void;/);

    assert.match(panelSource, /const sortBy = propSortBy \?\? internalSortBy;/);
    assert.match(panelSource, /const networkFilter = propNetworkFilter \?\? internalNetworkFilter;/);
    assert.match(panelSource, /const selectedLegIds = propSelectedLegIds \?\? internalSelectedLegIds;/);
    assert.match(panelSource, /const expandedCommuteId = propExpandedCommuteId !== undefined \? propExpandedCommuteId : internalExpandedCommuteId;/);
    assert.match(panelSource, /const expandedImpactDisclosures = propExpandedImpactDisclosures \?\? internalExpandedImpactDisclosures;/);
  });

  it("resets commutePathPreview cleanly when returning to commutes via dialog back or popstate", () => {
    assert.match(shellSource, /const returningToCommutesFromPreview = Boolean\(commutePathPreviewRef\.current\) && targetView === "commutes";/);
    assert.match(shellSource, /if \(returningToCommutesFromPreview\) \{[\s\S]*?commutePathPreviewRef\.current = null;\s*setCommutePathPreview\(null\);/);
    assert.match(shellSource, /if \(commutePathPreviewRef\.current && previous\.view === "commutes"\) \{[\s\S]*?commutePathPreviewRef\.current = null;\s*setCommutePathPreview\(null\);/);
    assert.match(shellSource, /if \(commutePathPreviewRef\.current\) \{[\s\S]*?commutePathPreviewRef\.current = null;\s*setCommutePathPreview\(null\);\s*setActiveView\("commutes"\);/);
  });

  it("deletes a commute without triggering navigation animation when already in commutes panel", () => {
    assert.match(shellSource, /if \(activeViewRef\.current === "commutes"\) \{\s*commutePathPreviewRef\.current = null;\s*setCommutePathPreview\(null\);/);
    assert.match(panelSource, /if \(viewedCommuteId === id\) \{\s*onClearViewedPath\(id\);\s*\}/);
  });

  it("records lastInteractedCommuteId and restores scroll to exact card on back from edit view", () => {
    assert.match(panelSource, /const lastInteractedCommuteIdRef = useRef<string \| null>\(null\);/);
    assert.match(panelSource, /lastInteractedCommuteIdRef\.current = commute\.id;/);
    assert.match(panelSource, /data-commute-card-id=\{commute\.id\}/);
    assert.match(panelSource, /card\.scrollIntoView\(\{/);
  });

  it("lifts and preserves focusedCommuteId across disruption map drill-down and back navigation", () => {
    assert.match(shellSource, /const \[commutesFocusedCommuteId, setCommutesFocusedCommuteId\] = useState<string \| null>\(null\);/);
    assert.match(shellSource, /setCommutesFocusedCommuteId\(commute\.id\);/);
    assert.match(shellSource, /focusedCommuteId=\{commutesFocusedCommuteId\}/);
    assert.match(shellSource, /onFocusedCommuteIdChange=\{setCommutesFocusedCommuteId\}/);
    assert.match(panelSource, /focusedCommuteId\?: string \| null;/);
    assert.match(panelSource, /const rawTarget = focusedCommuteId \|\| lastInteractedCommuteIdRef\.current \|\| viewedCommuteId;/);
  });
});
