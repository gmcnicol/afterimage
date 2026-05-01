import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type RowClassRules,
  type RowClickedEvent,
  type SortChangedEvent
} from 'ag-grid-community';
import { accent, muted } from '../styles';

ModuleRegistry.registerModules([AllCommunityModule]);

const studioGridTheme = themeQuartz.withParams({
  accentColor: accent,
  backgroundColor: 'rgba(12, 15, 21, 0.98)',
  borderColor: 'rgba(255, 255, 255, 0.08)',
  browserColorScheme: 'dark',
  cellTextColor: '#f6f7f9',
  chromeBackgroundColor: 'rgba(15, 18, 24, 0.96)',
  foregroundColor: '#f6f7f9',
  headerBackgroundColor: 'rgba(10, 13, 18, 0.98)',
  headerTextColor: muted,
  oddRowBackgroundColor: 'rgba(255, 255, 255, 0.025)',
  rowHoverColor: 'rgba(136, 160, 191, 0.12)',
  selectedRowBackgroundColor: 'rgba(136, 160, 191, 0.2)',
  wrapperBorderRadius: 14,
  fontFamily: '"IBM Plex Sans", "Aptos", "Segoe UI Variable Text", sans-serif',
  fontSize: 12,
  headerFontSize: 11,
  spacing: 7
});

export type StudioGridAction = 'open' | 'add' | 'remove' | 'reject' | 'keep' | 'favorite' | 'mark-in' | 'mark-out' | 'move-down' | 'move-up' | 'play' | 'select-all' | 'invert-selection';

export type StudioDataGridHandle<T> = {
  focusRow: (rowId: string) => void;
  getFocusedRow: () => T | undefined;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return target.isContentEditable
    || tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || target.closest('[contenteditable="true"], .ag-cell-inline-editing') !== null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, input, textarea, select, [role="button"]') !== null;
}

export function StudioDataGrid<T extends { id: string }>({
  rows,
  columns,
  focusedRowId,
  emptyMessage = 'No rows',
  searchRef,
  onFocusRow,
  onRowClick,
  onRowOpen,
  onAction,
  onSortChange,
  rowClassRules,
  showGridSelection = true,
  className,
  style,
  rowHeight = 44,
  headerHeight = 36
}: {
  rows: T[];
  columns: ColDef<T>[];
  focusedRowId?: string;
  emptyMessage?: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  onFocusRow?: (row: T) => void;
  onRowClick?: (row: T) => void;
  onRowOpen?: (row: T) => void;
  onAction?: (action: StudioGridAction, row: T) => void;
  onSortChange?: (sort?: { colId: string; direction: 'asc' | 'desc' }) => void;
  rowClassRules?: RowClassRules<T>;
  showGridSelection?: boolean;
  className?: string;
  style?: CSSProperties;
  rowHeight?: number;
  headerHeight?: number;
}) {
  const [api, setApi] = useState<GridApi<T>>();
  const pendingGRef = useRef(false);
  const defaultColDef = useMemo<ColDef<T>>(() => ({
    sortable: true,
    resizable: true,
    filter: false,
    minWidth: 86,
    flex: 1,
    wrapText: false,
    autoHeight: false,
    suppressHeaderMenuButton: true,
    cellStyle: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }), []);

  const focusRowAtIndex = (index: number) => {
    if (!api || rows.length === 0) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, rows.length - 1));
    const row = rows[safeIndex];
    if (!row) {
      return;
    }

    api.ensureIndexVisible(safeIndex, 'middle');
    api.setFocusedCell(safeIndex, columns[0]?.colId ?? columns[0]?.field ?? 'id');
    if (showGridSelection) {
      api.getRowNode(row.id)?.setSelected(true, true);
    }
    onFocusRow?.(row);
  };

  const getCurrentRow = () => {
    const rowId = focusedRowId ?? api?.getSelectedRows()[0]?.id;
    return rowId ? rows.find((row) => row.id === rowId) : rows[0];
  };

  const handleGridReady = (event: GridReadyEvent<T>) => {
    setApi(event.api);
  };

  const handleRowClicked = (event: RowClickedEvent<T>) => {
    if (event.data) {
      if (!isInteractiveTarget(event.event?.target ?? null)) {
        onFocusRow?.(event.data);
        onRowClick?.(event.data);
      }
    }
  };

  const handleSortChanged = (event: SortChangedEvent<T>) => {
    if (!onSortChange) {
      return;
    }

    const sortedColumn = event.api.getColumnState().find((column) => column.sort === 'asc' || column.sort === 'desc');
    onSortChange(sortedColumn?.colId && sortedColumn.sort
      ? { colId: sortedColumn.colId, direction: sortedColumn.sort }
      : undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const currentRow = getCurrentRow();
    const currentIndex = currentRow ? rows.findIndex((row) => row.id === currentRow.id) : -1;
    const key = event.key;

    if (key !== 'g') {
      pendingGRef.current = false;
    }

    if (key === '/') {
      event.preventDefault();
      event.stopPropagation();
      searchRef?.current?.focus();
      searchRef?.current?.select();
      return;
    }

    if (key === 'j') {
      event.preventDefault();
      event.stopPropagation();
      focusRowAtIndex(currentIndex < 0 ? 0 : currentIndex + 1);
      return;
    }

    if (key === 'k') {
      event.preventDefault();
      event.stopPropagation();
      focusRowAtIndex(currentIndex < 0 ? 0 : currentIndex - 1);
      return;
    }

    if (key === 'g') {
      event.preventDefault();
      event.stopPropagation();
      if (pendingGRef.current) {
        pendingGRef.current = false;
        focusRowAtIndex(0);
      } else {
        pendingGRef.current = true;
        window.setTimeout(() => {
          pendingGRef.current = false;
        }, 700);
      }
      return;
    }

    if (key === 'G') {
      event.preventDefault();
      event.stopPropagation();
      focusRowAtIndex(rows.length - 1);
      return;
    }

    if (!currentRow) {
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onRowOpen?.(currentRow);
      onAction?.('open', currentRow);
      return;
    }

    const actionMap: Record<string, StudioGridAction> = {
      a: 'add',
      r: 'remove',
      h: 'reject',
      l: 'keep',
      f: 'favorite',
      i: 'mark-in',
      o: 'mark-out',
      x: 'remove',
      J: 'move-down',
      K: 'move-up',
      p: 'play',
      A: 'select-all',
      I: 'invert-selection',
      ' ': 'play'
    };
    const action = actionMap[key];
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      onAction?.(action, currentRow);
    }
  };

  return (
    <div
      className={className}
      onKeyDown={handleKeyDown}
      style={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        ...style
      }}
    >
      <AgGridReact<T>
        theme={studioGridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        getRowId={(params) => params.data.id}
        onGridReady={handleGridReady}
        onRowClicked={handleRowClicked}
        onSortChanged={handleSortChanged}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        rowClassRules={rowClassRules}
        rowSelection={showGridSelection ? { mode: 'singleRow', checkboxes: false, enableClickSelection: true } : undefined}
        suppressCellFocus
        suppressMovableColumns
        animateRows={false}
        overlayNoRowsTemplate={`<span style="color:${muted};">${emptyMessage}</span>`}
      />
    </div>
  );
}
