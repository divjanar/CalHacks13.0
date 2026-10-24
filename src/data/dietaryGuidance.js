// Explicit Table 8 presets. These describe app selections, not universal rules for a religion.
const meatGroups = ['beef', 'pork', 'poultry', 'other meat']
const meatAndSeafood = [...meatGroups, 'fish', 'seafood', 'shellfish']

export const dietaryPresets = {
  'No preference': {
    meaning: 'This selection adds no dietary exclusions. Your saved food allergies still apply.',
    avoidedGroups: [],
    avoids: 'No additional foods are excluded by this selection.',
    allows: 'All food categories remain open, subject to your allergies and any personal needs you enter.',
  },
  Vegetarian: {
    meaning: 'This Table 8 preset excludes meat, poultry, fish and seafood. Eggs and dairy are permitted.',
    avoidedGroups: [...meatAndSeafood, 'meat derivatives'],
    avoids: 'All meat, poultry, fish and seafood, including meat- or fish-derived stock, broth, fat and gelatin.',
    allows: 'Plant-based foods, eggs and dairy are not excluded by this preset.',
  },
  Vegan: {
    meaning: 'This Table 8 preset excludes animal foods and animal-derived ingredients.',
    avoidedGroups: [...meatAndSeafood, 'eggs', 'dairy', 'honey', 'animal derivatives', 'meat derivatives'],
    avoids: 'All meat, poultry, fish, seafood, eggs, dairy and honey, plus animal-derived stock, broth, fat and gelatin.',
    allows: 'Plant-based foods are not excluded by this preset.',
  },
  Pescatarian: {
    meaning: 'This Table 8 preset excludes meat and poultry but permits fish and seafood.',
    avoidedGroups: [...meatGroups, 'meat derivatives'],
    avoids: 'Meat and poultry, including their stock, broth, fat and gelatin.',
    allows: 'Fish, seafood, eggs, dairy and plant-based foods are not excluded by this preset.',
  },
  'Hindu non-veg': {
    meaning: 'This Table 8 preset excludes beef and pork. Other animal foods are not automatically excluded.',
    avoidedGroups: ['beef', 'pork'],
    avoids: 'Beef and pork, including their stock, broth, fat and gelatin.',
    allows: 'Other meats, poultry, fish, seafood, eggs and dairy are not excluded by this preset.',
  },
  'Hindu veg': {
    meaning: 'This Table 8 preset is egg-free vegetarian. It excludes all meat, poultry, fish, seafood and eggs; dairy is permitted.',
    avoidedGroups: [...meatAndSeafood, 'eggs', 'meat derivatives'],
    avoids: 'All meat (including beef and pork), poultry, fish, seafood and eggs, including meat- or fish-derived stock, broth, fat and gelatin.',
    allows: 'Plant-based foods and dairy are not excluded by this preset.',
  },
  Jain: {
    meaning: 'This Table 8 preset is egg-free vegetarian and also excludes root vegetables, honey and alcohol.',
    avoidedGroups: [...meatAndSeafood, 'eggs', 'root vegetables', 'onion', 'garlic', 'potato', 'carrot', 'radish', 'beetroot', 'ginger', 'honey', 'alcohol', 'meat derivatives'],
    avoids: 'All meat, poultry, fish, seafood and eggs; root vegetables such as potatoes, carrots, onions, garlic, radishes, beetroot and ginger; honey, alcohol and meat-derived ingredients.',
    allows: 'Grains, pulses, fruit, above-ground vegetables and dairy are not excluded by this preset.',
  },
  Halal: {
    meaning: 'This Table 8 preset excludes pork, alcohol and animal ingredients that do not meet halal requirements.',
    avoidedGroups: ['pork', 'alcohol', 'non-halal meat', 'non-halal animal derivatives'],
    avoids: 'Pork and pork-derived stock, fat or gelatin; alcohol; non-halal meat and non-halal animal-derived ingredients.',
    allows: 'Halal-compliant meat, poultry, fish, seafood, eggs, dairy and plant-based foods are not excluded. Ingredient sourcing and halal preparation must be confirmed.',
  },
  Kosher: {
    meaning: 'This Table 8 preset excludes pork, shellfish, non-kosher ingredients and any combination of meat and dairy.',
    avoidedGroups: ['pork', 'shellfish', 'fish without fins and scales', 'non-kosher meat', 'non-kosher animal derivatives', 'meat and dairy together'],
    incompatibleGroups: [{ anyOf: meatGroups, with: 'dairy', label: 'meat and dairy together' }],
    avoids: 'Pork, shellfish, fish without fins and scales, non-kosher meat and animal derivatives, and meat mixed or prepared with dairy.',
    allows: 'Kosher-compliant meat, fish with fins and scales, eggs, dairy and plant-based foods are not excluded. Meat and dairy must stay separate; kosher sourcing, utensils and preparation must be confirmed.',
  },
  Buddhist: {
    meaning: 'This Table 8 preset uses an egg-free vegetarian diet that also excludes alliums and alcohol.',
    avoidedGroups: [...meatAndSeafood, 'eggs', 'onion', 'garlic', 'leek', 'chives', 'shallot', 'scallion', 'alliums', 'alcohol', 'meat derivatives'],
    avoids: 'All meat, poultry, fish, seafood and eggs; onions, garlic, leeks, chives, shallots and scallions; alcohol and meat-derived ingredients.',
    allows: 'Plant-based foods without the listed alliums, plus dairy, are not excluded by this preset.',
  },
}

export const dietaryGuidance = Object.fromEntries(
  Object.entries(dietaryPresets).map(([name, preset]) => [name, { meaning: preset.meaning, preset }]),
)
