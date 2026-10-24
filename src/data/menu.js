export const allergenOptions = ['Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat', 'Soy', 'Fish', 'Shellfish', 'Sesame']
export const religiousDietOptions = ['Hindu non-veg', 'Hindu veg', 'Jain', 'Halal', 'Kosher', 'Buddhist', 'Other']

// Keep the stored allergen key stable for existing accounts and menu matching.
export const allergenLabel = allergen => allergen === 'Milk' ? 'Dairy' : allergen
