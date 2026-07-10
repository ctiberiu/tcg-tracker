import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Modal } from './Modal'
import { Button } from './Button'

const meta = {
  title: 'UI/Modal',
  component: Modal,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Modal>

export default meta
type Story = StoryObj<typeof Modal>

function ModalDemo({ maxWidth }: { maxWidth?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Install the extension" maxWidth={maxWidth}>
        <p className="text-on-surface-variant text-sm">
          Modal body content goes here. Click the backdrop, press Escape, or use the close button to dismiss.
        </p>
      </Modal>
    </div>
  )
}

export const Open: Story = {
  render: () => <ModalDemo />,
}

export const Wide: Story = {
  render: () => <ModalDemo maxWidth="max-w-2xl" />,
}
