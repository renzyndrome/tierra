// Phone-friendly form sizing for staff dialogs: 44px tap targets and 16px text
// on small screens (smaller text makes iOS Safari zoom on focus), the compact
// desktop look from the sm/md breakpoints up.
export const FIELD_CLASS = 'mt-1 h-11 sm:h-9'

export const SELECT_CLASS =
  'mt-1 w-full h-11 sm:h-9 px-3 border border-gray-300 rounded-md bg-white text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none disabled:opacity-50'

// A dialog taller than a phone screen scrolls inside itself so the footer
// buttons stay reachable. dvh follows the mobile browser bars; vh is the fallback.
export const SCROLLING_DIALOG_CLASS = 'max-h-[90vh] supports-[height:100dvh]:max-h-[90dvh] overflow-y-auto'
