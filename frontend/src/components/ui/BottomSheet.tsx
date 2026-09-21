import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  maxHeight?: string;
  hideCloseButton?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = "85vh",
  hideCloseButton = false,
}: BottomSheetProps) {
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - touchStartY.current;
    // If swiped down more than 70px from handle bar, close sheet
    if (diff > 70) {
      onClose();
    }
    touchStartY.current = null;
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} role="presentation">
      <div
        ref={containerRef}
        className="bottom-sheet-container"
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bottom-sheet-handle-bar"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={onClose}
          title="Glisser vers le bas pour fermer"
        >
          <div className="bottom-sheet-handle" />
        </div>

        {(title || subtitle || !hideCloseButton) && (
          <div className="bottom-sheet-header">
            <div>
              {title && <h3 className="bottom-sheet-title">{title}</h3>}
              {subtitle && <p className="bottom-sheet-subtitle">{subtitle}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                className="bottom-sheet-close"
                onClick={onClose}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="bottom-sheet-content">{children}</div>
      </div>
    </div>
  );
}
