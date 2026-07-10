import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProductCard } from './ProductCard'

const meta = {
  title: 'UI/ProductCard',
  component: ProductCard,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
} satisfies Meta<typeof ProductCard>

export default meta
type Story = StoryObj<typeof meta>

const baseProduct = {
  title: 'Pokémon TCG: Scarlet & Violet Booster Box',
  price: 549.99,
  url: '#',
  image_url: 'https://images.pokemontcg.io/sv1/logo.png',
  in_stock: true,
  store_name: 'Flamey',
  first_seen: new Date().toISOString(),
}

export const InStock: Story = {
  args: {
    product: baseProduct,
  },
}

export const OutOfStock: Story = {
  args: {
    product: {
      ...baseProduct,
      title: 'Pokémon TCG: Twilight Masquerade Elite Trainer Box',
      in_stock: false,
    },
  },
}

export const NoImage: Story = {
  args: {
    product: {
      ...baseProduct,
      title: 'One Piece Card Game: Booster Pack',
      image_url: null,
    },
  },
}

export const NoPrice: Story = {
  args: {
    product: {
      ...baseProduct,
      title: 'Magic: The Gathering — Bloomburrow Collector Booster',
      price: null,
    },
  },
}

export const LongTitle: Story = {
  args: {
    product: {
      ...baseProduct,
      title: 'Yu-Gi-Oh! Legendary Duelists: Duels From the Deep Special Edition Booster Box with Extra Promo Cards',
    },
  },
}
