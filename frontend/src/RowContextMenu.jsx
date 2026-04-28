import React, { useEffect } from 'react';
import { usePopper } from 'react-popper';

export default function RowContextMenu({
  position,
  onClose,
  onCopy,
  onCut,
  onInsertRow,
  onDeleteRow,
}) {
  const [referenceElement, setReferenceElement] = React.useState(null);
  const [popperElement, setPopperElement] = React.useState(null);

  const popper = usePopper(referenceElement, popperElement, {
    placement: 'bottom-start',
    strategy: 'fixed',
  });

  useEffect(() => {
    // Create a virtual reference element at the click position
    setReferenceElement({
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        top: position.y,
        right: position.x,
        bottom: position.y,
        left: position.x,
      }),
    });
  }, [position]);

  const menuItems = [
    { label: 'Copy', onClick: onCopy },
    { label: 'Cut', onClick: onCut },
    { type: 'divider' },
    { label: 'Insert row', onClick: onInsertRow },
    { label: 'Delete row', onClick: onDeleteRow },
  ];

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div
        ref={setPopperElement}
        style={{ ...popper.styles.popper, zIndex: 1000 }}
        {...popper.attributes.popper}
      >
        <div className="context-menu shadow-5">
          {menuItems.map((item, index) =>
            item.type === 'divider' ? (
              <div key={index} className="menu-divider" />
            ) : (
              <button
                key={index}
                type="button"
                className="context-menu-item"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}


