import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    variant: { control: 'select', options: ['circle', 'mark'] },
  },
  args: {
    children: <span className="text-primary text-lg font-bold">T</span>,
  },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Circle: Story = { args: { variant: 'circle' } }
export const Mark: Story = { args: { variant: 'mark' } }
export const Small: Story = { args: { size: 'sm', children: '1' } }
export const Medium: Story = { args: { size: 'md' } }
