import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input, Select, Textarea } from './Input'

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['container', 'low', 'bordered'] },
  },
  args: {
    placeholder: 'Type something...',
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Container: Story = { args: { variant: 'container' } }
export const Low: Story = { args: { variant: 'low' } }
export const Bordered: Story = { args: { variant: 'bordered' } }
export const FullWidth: Story = {
  args: { variant: 'container', fullWidth: true },
  decorators: [(Story) => <div className="w-96"><Story /></div>],
}
export const Disabled: Story = { args: { disabled: true, value: 'Read only' } }

export const SelectVariant: Story = {
  render: (args) => (
    <Select variant={args.variant as 'container' | 'low' | 'bordered'}>
      <option value="">All stores</option>
      <option value="a">Store A</option>
      <option value="b">Store B</option>
    </Select>
  ),
}

export const TextareaVariant: Story = {
  render: (args) => (
    <Textarea variant={args.variant as 'container' | 'low' | 'bordered'} placeholder="Notes..." rows={4} />
  ),
}
