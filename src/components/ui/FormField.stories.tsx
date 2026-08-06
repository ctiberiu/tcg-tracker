import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormField } from './FormField'
import { Input } from './Input'

const meta = {
  title: 'UI/FormField',
  component: FormField,
  parameters: { layout: 'centered' },
  args: {
    label: 'Store name',
    htmlFor: 'store-name',
  },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
} satisfies Meta<typeof FormField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: <Input id="store-name" variant="container" fullWidth placeholder="e.g. Flamey" />,
  },
}

export const WithError: Story = {
  args: {
    error: 'This field is required',
    children: <Input id="store-name" variant="container" fullWidth placeholder="e.g. Flamey" />,
  },
}
