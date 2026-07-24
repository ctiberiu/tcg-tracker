import { useRef, useState } from 'react'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useId,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react'

// Panel never shrinks below this — enough for the pinned input plus a
// glimpse of one option row, so it stays legibly scrollable instead of
// collapsing to an unusable sliver. Above the floor it fills whichever
// side (top/bottom) flip() picked, up to its natural size.
const PANEL_FLOOR = 110
const PANEL_NATURAL_MAX = 320

interface UseFilterDropdownOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Enables listbox role + arrow/Home/End virtual navigation over listRef items. */
  listNav?: boolean
}

export function useFilterDropdown({ open, onOpenChange, listNav = false }: UseFilterDropdownOptions) {
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLElement | null>>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listboxId = useId()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 16 }),
      shift({ padding: 16 }),
      size({
        padding: 16,
        apply({ availableHeight }) {
          setMaxHeight(availableHeight < PANEL_FLOOR ? PANEL_FLOOR : Math.min(availableHeight, PANEL_NATURAL_MAX))
        },
      }),
    ],
  })

  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'listbox', enabled: listNav })
  const listNavigation = useListNavigation(context, {
    enabled: listNav,
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
    focusItemOnOpen: false,
  })

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([dismiss, role, listNavigation])

  return {
    refs,
    floatingStyles,
    context,
    getReferenceProps,
    getFloatingProps,
    getItemProps,
    listRef,
    activeIndex,
    setActiveIndex,
    maxHeight,
    listboxId,
  }
}
