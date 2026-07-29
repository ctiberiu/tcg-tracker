import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import type { GameInfo, GameKey } from './tokens'
import { FilterCheckbox } from './FilterCheckbox'
import { FilterDropdownButton } from './FilterDropdownButton'
import { FilterDropdownPanel } from './FilterDropdownPanel'
import { StatusDot } from './StatusDot'
import { dropdownRowStyle, dropdownTypeaheadStyle, visuallyHiddenStyle } from './filterStyles'
import { useFilterDropdown } from './useFilterDropdown'

interface ChannelFilterDropdownProps {
  channels: { game: GameInfo; count: number }[]
  selected: GameKey[]
  onToggle: (key: GameKey) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelFilterDropdown({ channels, selected, onToggle, open, onOpenChange }: ChannelFilterDropdownProps) {
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
    if (!q) return channels
    return channels.filter(({ game }) => game.label.toLowerCase().includes(q))
  }, [channels, query])

  useEffect(() => {
    setActiveIndex(null)
  }, [query, setActiveIndex])

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      setAnnouncement(filtered.length === 1 ? '1 channel' : `${filtered.length} channels`)
    }, 250)
    return () => clearTimeout(timeout)
  }, [filtered.length, open])

  const toggleActiveOption = () => {
    if (activeIndex == null) return
    const item = filtered[activeIndex]
    if (item) onToggle(item.game.key)
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
        label="CHANNEL"
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
              width={300}
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
                aria-label="Filter channels"
                aria-controls={listboxId}
                aria-activedescendant={activeIndex != null ? `channel-option-${activeIndex}` : undefined}
                placeholder="Filter channels…"
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
                aria-label="Channels"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
              >
                {filtered.map(({ game, count }, index) => {
                  const checked = selected.includes(game.key)
                  const active = index === activeIndex
                  return (
                    <div
                      key={game.key}
                      id={`channel-option-${index}`}
                      role="option"
                      aria-selected={checked}
                      ref={(node) => {
                        listRef.current[index] = node
                      }}
                      onClick={() => onToggle(game.key)}
                      className="pr-dropdown-row"
                      style={{
                        ...dropdownRowStyle,
                        background: checked || active ? '#ffffff08' : 'transparent',
                        outline: active ? '1px solid var(--pr-border-hover)' : 'none',
                        outlineOffset: -1,
                      }}
                      {...getItemProps({
                        onClick: () => onToggle(game.key),
                      })}
                    >
                      <span aria-hidden="true" style={{ display: 'contents' }}>
                        <FilterCheckbox checked={checked} color={game.color} />
                        <StatusDot color={game.color} size={7} />
                      </span>
                      <span
                        style={{
                          flex: 1,
                          color: game.color,
                          fontSize: 11,
                          letterSpacing: 0.5,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {game.label}
                      </span>
                      <span style={{ color: 'var(--pr-text-dim)', fontSize: 11 }}>{count}</span>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: '14px 12px', color: 'var(--pr-text-dim)', fontSize: 11 }}>No channels match.</div>
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
