export const MODAL_SCROLL_LOCK_CLASS = 'quiz-modal-scroll-locked';
const MODAL_SCROLL_OFFSET_PROPERTY = '--quiz-modal-scroll-offset';

type BodyStyleSnapshot = {
  position: string;
  top: string;
  right: string;
  left: string;
  width: string;
};

function hasVisibleModal(ownerDocument: Document) {
  const view = ownerDocument.defaultView;

  return Array.from(ownerDocument.querySelectorAll<HTMLElement>('.ant-modal-wrap')).some((modal) => {
    if (modal.hidden || modal.getAttribute('aria-hidden') === 'true') return false;
    const style = view?.getComputedStyle(modal);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  });
}

export function installModalScrollLock(ownerDocument: Document = document) {
  const root = ownerDocument.documentElement;
  const body = ownerDocument.body;
  const view = ownerDocument.defaultView;
  const Observer = view?.MutationObserver;
  let locked = false;
  let lockedScrollY = 0;
  let bodyStyleSnapshot: BodyStyleSnapshot | null = null;

  const unlock = () => {
    if (!locked) return;

    root.classList.remove(MODAL_SCROLL_LOCK_CLASS);
    root.style.removeProperty(MODAL_SCROLL_OFFSET_PROPERTY);
    if (bodyStyleSnapshot) {
      Object.assign(body.style, bodyStyleSnapshot);
      bodyStyleSnapshot = null;
    }
    locked = false;
    view?.scrollTo(0, lockedScrollY);
  };

  if (!body || !Observer) return unlock;

  const sync = () => {
    if (!hasVisibleModal(ownerDocument)) {
      unlock();
      return;
    }
    if (locked) return;

    lockedScrollY = view?.scrollY ?? 0;
    bodyStyleSnapshot = {
      position: body.style.position,
      top: body.style.top,
      right: body.style.right,
      left: body.style.left,
      width: body.style.width,
    };
    root.style.setProperty(MODAL_SCROLL_OFFSET_PROPERTY, (-lockedScrollY) + 'px');
    root.classList.add(MODAL_SCROLL_LOCK_CLASS);
    Object.assign(body.style, {
      position: 'fixed',
      top: (-lockedScrollY) + 'px',
      right: '0px',
      left: '0px',
      width: '100%',
    });
    locked = true;
  };
  const observer = new Observer(sync);

  observer.observe(body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
  });
  sync();

  return () => {
    observer.disconnect();
    unlock();
  };
}