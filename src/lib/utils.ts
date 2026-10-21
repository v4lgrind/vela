import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The app's type scale (main.css @theme --text-*) must be known as font sizes,
// otherwise twMerge treats `text-page` as a colour and drops it next to `text-text-heading`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['page', 'page-wide', 'section', 'body', 'caption', 'label'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
