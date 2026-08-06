import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from './Card'

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'centered' },
  argTypes: {
    padding: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl'] },
    rounded: { control: 'select', options: ['lg', 'xl', '2xl'] },
    surface: { control: 'select', options: ['low', 'container'] },
  },
  args: {
    children: 'Card content',
    padding: 'lg',
  },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof Card>

export const Low: Story = { args: { surface: 'low' } }
export const Container: Story = { args: { surface: 'container' } }
export const Interactive: Story = { args: { as: 'a', href: '#', interactive: true, padding: 'md' } }

export const PaddingNone: Story = { args: { padding: 'none' } }
export const PaddingSm: Story = { args: { padding: 'sm' } }
export const PaddingMd: Story = { args: { padding: 'md' } }
export const PaddingLg: Story = { args: { padding: 'lg' } }
export const PaddingXl: Story = { args: { padding: 'xl' } }

export const RoundedLg: Story = { args: { rounded: 'lg' } }
export const RoundedXl: Story = { args: { rounded: 'xl' } }
export const Rounded2xl: Story = { args: { rounded: '2xl' } }

export const AsForm: Story = { args: { as: 'form', children: 'Form contents' } }
