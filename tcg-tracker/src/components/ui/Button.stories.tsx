import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['solid', 'soft', 'neutral', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
  args: {
    children: 'Button',
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Solid: Story = { args: { variant: 'solid' } }
export const Soft: Story = { args: { variant: 'soft' } }
export const Neutral: Story = { args: { variant: 'neutral' } }
export const Ghost: Story = { args: { variant: 'ghost' } }
export const Danger: Story = { args: { variant: 'danger' } }

export const Small: Story = { args: { size: 'sm' } }
export const Medium: Story = { args: { size: 'md' } }
export const Large: Story = { args: { size: 'lg' } }

export const Disabled: Story = { args: { disabled: true } }

export const Active: Story = { args: { variant: 'ghost', active: true } }

export const Destructive: Story = { args: { variant: 'ghost', destructive: true, children: 'Delete' } }

const TrashIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export const IconOnly: Story = {
  args: { iconOnly: true, variant: 'ghost', children: TrashIcon },
}

export const AsLink: Story = {
  args: { as: 'a', href: '#', children: 'Download' },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 bg-background p-6">
      <Button variant="solid">Solid</Button>
      <Button variant="soft">Soft</Button>
      <Button variant="neutral">Neutral</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
}
