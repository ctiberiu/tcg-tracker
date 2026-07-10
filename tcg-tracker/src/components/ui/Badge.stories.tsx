import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './Badge'

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'primary', 'tertiary', 'error'] },
  },
  args: {
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Neutral: Story = { args: { tone: 'neutral' } }
export const Primary: Story = { args: { tone: 'primary' } }
export const Tertiary: Story = { args: { tone: 'tertiary' } }
export const Error: Story = { args: { tone: 'error' } }
export const NotBold: Story = { args: { tone: 'primary', bold: false } }

export const AllTones: Story = {
  render: () => (
    <div className="flex gap-2 bg-background p-4">
      <Badge tone="neutral">Idle</Badge>
      <Badge tone="primary">Running</Badge>
      <Badge tone="tertiary">Awaiting Payment</Badge>
      <Badge tone="error">Failed</Badge>
    </div>
  ),
}
