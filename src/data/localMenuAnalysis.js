import { matchDietaryNeeds } from './dietaryMatching.js'

// Match only words actually printed for this dish. This is a vocabulary,
// not a recipe database: a croissant does not imply butter, milk, or wheat.
const ingredientWords = [
  'cream cheese', 'cheese sticks', 'chicken strips', 'chicken breast', 'chicken wings',
  'battered fish', 'french fries', 'hash browns', 'rice noodles', 'coconut milk',
  'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'peanut butter',
  'marinara sauce', 'teriyaki sauce', 'soy sauce', 'peanut sauce', 'curry broth',
  'beef stock', 'chicken stock', 'vegetable stock', 'beef broth', 'chicken broth',
  'vegetable broth', 'pork fat', 'beef fat', 'olive oil', 'soy oil',
  'calamari', 'prawns', 'prawn', 'shrimp', 'fish', 'salmon', 'tuna', 'cod',
  'crab', 'lobster', 'clams', 'mussels', 'oysters', 'scallops', 'squid', 'octopus',
  'chicken', 'turkey', 'duck', 'beef', 'veal', 'brisket', 'pork', 'bacon', 'ham',
  'prosciutto', 'pancetta', 'pepperoni', 'chorizo', 'lamb', 'goat', 'lard',
  'ricotta', 'parmigiano', 'stracchino', 'manchego', 'fontina',
  'cheddar', 'mozzarella', 'parmesan', 'feta', 'cheese', 'buttermilk', 'milk',
  'butter', 'cream', 'yogurt', 'ghee', 'whey', 'casein', 'eggs', 'egg', 'tofu',
  'potatoes', 'potato', 'onions', 'onion', 'garlic', 'artichokes', 'artichoke',
  'mushrooms', 'mushroom', 'tomatoes', 'tomato', 'spinach', 'olives', 'olive',
  'jalapeño peppers', 'jalapeno peppers', 'bell peppers', 'bell pepper',
  'spicy peppers', 'peppers', 'lettuce', 'arugula', 'carrots', 'carrot',
  'cauliflower', 'broccoli', 'cabbage', 'celery', 'cucumber', 'avocado',
  'zucchini', 'eggplant', 'radish', 'ginger', 'beets', 'leeks', 'chives',
  'shallots', 'scallions', 'peanuts', 'peanut', 'almonds', 'almond', 'walnuts',
  'cashews', 'pecans', 'pistachios', 'hazelnuts', 'sesame', 'tahini', 'soy',
  'wheat', 'rice', 'pasta', 'bread', 'toast', 'pancakes', 'fries', 'quinoa',
  'beans', 'lentils', 'chickpeas', 'corn', 'oats', 'flour', 'honey', 'gelatin',
  'chocolate', 'coconut', 'apple', 'applesauce', 'banana', 'strawberries',
  'blueberries', 'mint', 'basil', 'cilantro', 'parsley', 'mustard', 'mayonnaise',
  'aioli', 'hollandaise', 'gravy', 'salsa', 'wine', 'beer', 'rum', 'bourbon',
  'sugar', 'salt', 'lemon', 'lime', 'sourdough', 'rye',
].sort((a, b) => b.length - a.length)
const escaped = ingredientWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const ingredientPattern = new RegExp(`\\b(?:(?:vegan|plant-based|dairy-free|non-dairy)\\s+(?:cheese|butter|cream|milk|yogurt)|(?:vegan|plant-based|meatless)\\s+(?:beef|bacon|ham|chicken|pork)|${escaped.join('|')})\\b`, 'giu')

export function extractListedIngredients(dish) {
  const text = [dish.name, dish.description].filter(Boolean).join('. ')
  const seen = new Set()
  return [...text.matchAll(ingredientPattern)].flatMap(match => {
    const before = text.slice(Math.max(0, match.index - 18), match.index)
    const after = text.slice(match.index + match[0].length)
    if (/(?:\bno|\bwithout|\bfree from)\s*$/i.test(before) || /^[- ]free\b/i.test(after)) return []
    const key = match[0].toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [match[0]]
  })
}

export function analyzeDishLocally(dish, preferences = {}) {
  const listedIngredients = extractListedIngredients(dish)
  if (dish.analysisMethod === 'gemini') {
    const evidence = String(dish.evidence || '').toLowerCase().replace(/\s+/g, ' ')
    for (const ingredient of dish.listedIngredients || []) {
      if (typeof ingredient !== 'string' || !ingredient.trim()) continue
      const name = ingredient.toLowerCase().replace(/\s+/g, ' ').trim()
      // Keep only source-supported additions; don't turn coconut milk into milk.
      if (evidence.includes(name) && !listedIngredients.some(value => value.toLowerCase().includes(name))) listedIngredients.push(ingredient)
    }
  }
  // Discard cached AI concerns and matching results. Recompute from current text.
  const source = { ...dish, description: dish.description || '', listedIngredients, possibleAllergens: [],
    ingredientEvidence: listedIngredients.map(ingredient => ({ ingredient, evidence: ingredient })),
    extractionStatus: dish.analysisMethod === 'gemini' ? 'readable' : 'local', analysisMethod: dish.analysisMethod === 'gemini' ? 'gemini' : 'local',
    ingredientCompleteness: 'unknown', sourcing: 'unknown', crossContact: 'unknown',
    restaurantConfirmed: false }
  const local = matchDietaryNeeds(source, preferences)
  const customNeeds = Boolean(preferences.notes?.trim() || preferences.religiousDetails?.trim() || preferences.diet === 'Other')
  const sourcingNeeds = ['Halal', 'Kosher'].includes(preferences.diet)
  const localCandidate = Boolean(!dish.ingredientsUnavailable && !local.hasConflict && listedIngredients.length && preferences.allergiesAnswered && !customNeeds && !sourcingNeeds)
  return { ...source, matching: {
    checkedLocally: true, assessed: false, recommended: false, localCandidate,
    hasConflict: local.hasConflict,
    dietConflicts: local.dietConflicts.length ? [{ group: preferences.diet,
      evidence: local.dietConflicts.map(item => item.evidence) }] : [],
    allergyConflicts: local.allergyConflicts,
    recommendationReason: customNeeds
      ? 'Personal dietary notes need confirmation with the restaurant.'
      : sourcingNeeds ? 'Religious sourcing and preparation need confirmation with the restaurant.'
        : 'Checked against the listed text only. Complete ingredients, sourcing and cross-contact remain unknown.',
    suitabilityScore: local.hasConflict ? 0 : localCandidate ? 100 : 50,
    status: local.hasConflict ? 'WARNING IDENTIFIED' : 'CHECK WITH THE WAITER',
  } }
}
