import { useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  activeIndex,
  height = 420
}: {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  activeIndex?: number;
  height?: number | string;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    overscan: 6
  });

  useEffect(() => {
    if (activeIndex === undefined || activeIndex < 0 || activeIndex >= items.length) {
      return;
    }

    virtualizer.scrollToIndex(activeIndex, {
      align: 'auto'
    });
  }, [activeIndex, items.length, virtualizer]);

  return (
    <div
      className="studio-scrollable"
      ref={setScrollElement}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: 'rgba(15, 18, 24, 0.88)',
        contain: 'strict'
      }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              insetInline: 0,
              transform: `translateY(${virtualItem.start}px)`,
              padding: '8px 10px',
              width: '100%'
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
