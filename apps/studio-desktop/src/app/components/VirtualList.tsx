import { useEffect, useRef } from 'react';

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
  const scrollElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeIndex === undefined || activeIndex < 0 || activeIndex >= items.length) {
      return;
    }

    const scrollElement = scrollElementRef.current;
    if (!scrollElement) {
      return;
    }

    const itemHeight = estimateSize + 16;
    const targetTop = itemHeight * activeIndex;
    const targetBottom = targetTop + itemHeight;
    const viewportTop = scrollElement.scrollTop;
    const viewportBottom = viewportTop + scrollElement.clientHeight;

    if (targetTop < viewportTop) {
      scrollElement.scrollTo({ top: targetTop });
      return;
    }

    if (targetBottom > viewportBottom) {
      scrollElement.scrollTo({ top: Math.max(0, targetBottom - scrollElement.clientHeight) });
    }
  }, [activeIndex, estimateSize, items.length]);

  return (
    <div
      className="studio-scrollable"
      ref={scrollElementRef}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: 'rgba(15, 18, 24, 0.88)'
      }}
    >
      <div style={{ display: 'grid', gap: 0 }}>
        {items.map((item, index) => (
          <div
            key={index}
            data-index={index}
            style={{
              padding: '8px 10px',
              width: '100%'
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
