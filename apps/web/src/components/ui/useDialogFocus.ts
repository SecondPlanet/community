import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogStack: symbol[] = [];

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

interface UseDialogFocusOptions {
  open: boolean;
  onClose: () => void;
  disableEscape?: boolean;
}

/** Keeps keyboard focus inside the top-most dialog and restores its trigger on close. */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { open, onClose, disableEscape = false }: UseDialogFocusOptions,
) {
  const onCloseRef = useRef(onClose);
  const disableEscapeRef = useRef(disableEscape);

  onCloseRef.current = onClose;
  disableEscapeRef.current = disableEscape;

  useEffect(() => {
    if (!open) return;

    const token = Symbol('dialog');
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(token);

    const container = containerRef.current;
    const initialTarget =
      container?.querySelector<HTMLElement>('[data-autofocus]') ??
      (container ? focusableElements(container)[0] : null) ??
      container;
    initialTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== token) return;

      if (event.key === 'Escape' && !disableEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) return;
      const elements = focusableElements(containerRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !containerRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !containerRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = dialogStack.lastIndexOf(token);
      if (index >= 0) dialogStack.splice(index, 1);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [containerRef, open]);
}
