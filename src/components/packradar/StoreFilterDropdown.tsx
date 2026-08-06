import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { FilterCheckbox } from './FilterCheckbox'
import { FilterDropdownButton } from './FilterDropdownButton'
import { FilterDropdownPanel } from './FilterDropdownPanel'
import { dropdownRowStyle, dropdownTypeaheadStyle, visuallyHiddenStyle } from './filterStyles'
import { useFilterDropdown } from './useFilterDropdown'

interface StoreFilterDropdownProps {
  stores: { name: string; count: number }[]
  selected: string[]
  onToggle: (name: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StoreFilterDropdown({ stores, selected, onToggle, open, onOpenChange }: StoreFilterDropdownProps) {
  const [query, setQuery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)

  const {
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
  } = useFilterDropdown({ open, onOpenChange, listNav: true })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => s.name.toLowerCase().includes(q))
  }, [stores, query])

  useEffect(() => {
    setActiveIndex(null)
  }, [query, setActiveIndex])

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      setAnnouncement(filtered.length === 1 ? '1 store' : `${filtered.length} stores`)
    }, 250)
    return () => clearTimeout(timeout)
  }, [filtered.length, open])

  const toggleActiveOption = () => {
    if (activeIndex == null) return
    const item = filtered[activeIndex]
    if (item) onToggle(item.name)
  }

  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      refs.setPositionReference(node)
    },
    [refs],
  )

  return (
    <div style={{ position: 'relative' }}>
      <FilterDropdownButton
        ref={setTriggerRef}
        label="STORE"
        count={selected.length}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => onOpenChange(!open)}
      />
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} returnFocus={triggerRef}>
            <FilterDropdownPanel
              // eslint-disable-next-line react-hooks/refs -- floating-ui callback-ref setter, not a `.current` read
              ref={refs.setFloating}
              width={280}
              maxHeight={maxHeight}
              floatingStyles={floatingStyles}
              {...getFloatingProps()}
            >
              <input
                // eslint-disable-next-line react-hooks/refs -- floating-ui callback-ref setter, not a `.current` read
                ref={refs.setReference}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-label="Search stores"
                aria-controls={listboxId}
                aria-activedescendant={activeIndex != null ? `store-option-${activeIndex}` : undefined}
                placeholder={`Search ${stores.length} stores…`}
                style={dropdownTypeaheadStyle}
                {...getReferenceProps({
                  value: query,
                  onChange: (e) => setQuery((e.target as HTMLInputElement).value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      toggleActiveOption()
                    }
                  },
                })}
              />
              <div
                id={listboxId}
                role="listbox"
                aria-multiselectable="true"
                aria-label="Stores"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
              >
                {filtered.map(({ name, count }, index) => {
                  const checked = selected.includes(name)
                  const active = index === activeIndex
                  return (
                    <div
                      key={name}
                      id={`store-option-${index}`}
                      role="option"
                      aria-selected={checked}
                      ref={(node) => {
                        listRef.current[index] = node
                      }}
                      className="pr-dropdown-row"
                      style={{
                        ...dropdownRowStyle,
                        background: checked || active ? '#ffffff08' : 'transparent',
                        outline: active ? '1px solid var(--pr-border-hover)' : 'none',
                        outlineOffset: -1,
                      }}
                      {...getItemProps({
                        onClick: () => onToggle(name),
                      })}
                    >
                      <FilterCheckbox checked={checked} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color: 'var(--pr-text-bright)',
                          fontSize: 11,
                          letterSpacing: 0.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--pr-text-dim)', fontSize: 11, flex: 'none' }}>{count}</span>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: '14px 12px', color: 'var(--pr-text-dim)', fontSize: 11 }}>No stores match.</div>
                )}
              </div>
              <span role="status" aria-live="polite" style={visuallyHiddenStyle}>
                {announcement}
              </span>
            </FilterDropdownPanel>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  )
}
