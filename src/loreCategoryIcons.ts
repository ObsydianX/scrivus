export const LORE_CATEGORY_ICONS = [
  { value: 'person', label: 'Character / Person', iconClass: 'ti-user' },
  { value: 'people', label: 'Group / Culture / Species', iconClass: 'ti-users' },
  { value: 'crown', label: 'Ruler / Nobility', iconClass: 'ti-crown' },
  { value: 'shield', label: 'Faction / Organization', iconClass: 'ti-shield' },
  { value: 'flag', label: 'Nation', iconClass: 'ti-flag' },
  { value: 'world', label: 'World', iconClass: 'ti-world' },
  { value: 'map', label: 'Region / Landmass', iconClass: 'ti-map' },
  { value: 'mountain', label: 'Natural Location', iconClass: 'ti-mountain' },
  { value: 'city', label: 'City / Settlement', iconClass: 'ti-building-community' },
  { value: 'building', label: 'Building', iconClass: 'ti-building' },
  { value: 'home', label: 'Home', iconClass: 'ti-home' },
  { value: 'castle', label: 'Castle / Fortress', iconClass: 'ti-building-castle' },
  { value: 'weapon', label: 'Weapon / Conflict', iconClass: 'ti-sword' },
  { value: 'item', label: 'Item / Artifact', iconClass: 'ti-diamond' },
  { value: 'creature', label: 'Creature / Animal', iconClass: 'ti-paw' },
  { value: 'magic', label: 'Magic / Spell', iconClass: 'ti-sparkles' },
  { value: 'book', label: 'History / Religion / Lore', iconClass: 'ti-book' },
  { value: 'event', label: 'Era / Event', iconClass: 'ti-calendar-event' },
  { value: 'nature', label: 'Flora / Ecosystem', iconClass: 'ti-tree' },
  { value: 'science', label: 'Science / Substance', iconClass: 'ti-flask' },
  { value: 'language', label: 'Language', iconClass: 'ti-language' },
  { value: 'mystery', label: 'Mystery / Uncategorized', iconClass: 'ti-help-circle' },
] as const

export type LoreCategoryIcon = typeof LORE_CATEGORY_ICONS[number]['value']

export function getLoreCategoryIconClass(icon: LoreCategoryIcon | undefined) {
  return LORE_CATEGORY_ICONS.find(option => option.value === icon)?.iconClass
}
