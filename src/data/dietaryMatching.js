import { dietaryPresets } from './dietaryGuidance.js'

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const patterns = {
  beef: /\b(beef|veal|brisket|sirloin|ribeye|oxtail|hamburger|filet mignon|new york steak)\b/,
  pork: /\b(pork|bacon|ham|prosciutto|pancetta|pepperoni|lard|chorizo)\b/,
  poultry: /\b(chicken|turkey|duck|poultry)\b/,
  'other meat': /\b(lamb|mutton|goat|venison|rabbit|bison)\b/,
  fish: /\b(fish|salmon|tuna|cod|anchovies|trout|halibut|tilapia)\b/,
  seafood: /\bseafood\b/,
  shellfish: /\b(shrimp|prawns?|crab|lobster|clams?|mussels?|oysters?|scallops?|calamari|squid|octopus)\b/,
  dairy: /\b(milk|buttermilk|cheese|ricotta|parmigiano|stracchino|manchego|fontina|cheddar|monterey jack|parmesan|mozzarella|feta|yogurt|butter|ghee|cream|whey|casein)\b/,
  eggs: /\b(eggs?|omelettes?|omelets?|mayonnaise|mayo|hollandaise)\b/,
  honey: /\bhoney\b/, alcohol: /\b(wine|beer|bourbon|rum|vodka|whiskey|sake|sherry|alcohol)\b/,
  onion: /\bonions?\b/, garlic: /\bgarlic\b/, potato: /\b(potatoes|potato|fries|hash browns?)\b/,
  carrot: /\bcarrots?\b/, radish: /\b(radishes|radish|daikon)\b/, beetroot: /\b(beets?|beetroot)\b/,
  ginger: /\bginger\b/, leek: /\bleeks?\b/, chives: /\bchives?\b/,
  shallot: /\bshallots?\b/, scallion: /\b(scallions?|green onions?)\b/,
  'root vegetables': /\b(root vegetables?|turnips?|parsnips?|sweet potatoes?|yams?)\b/,
  alliums: /\b(alliums?|onions?|garlic|leeks?|chives?|shallots?|scallions?)\b/,
}
const allergyPatterns = {
  Peanuts: /\bpeanuts?\b/, 'Tree nuts': /\b(almonds?|walnuts?|cashews?|pecans?|pistachios?|hazelnuts?|pine nuts?)\b/,
  Wheat: /\b(wheat|semolina|durum|bulgur|couscous|seitan)\b/, Soy: /\b(soy|soya|tofu|edamame|miso|tempeh)\b/,
  Sesame: /\b(sesame|tahini)\b/,
}
function dairyText(text) {
  return text.replace(/\b(coconut|soy|oat|almond|rice|cashew|pea) (milk|cream)\b/g, '')
    .replace(/\b(peanut|almond|cashew|apple|cocoa) butter\b/g, '')
    .replace(/\b(vegan|plant-based|dairy-free|non-dairy) (cheese|butter|cream|milk|yogurt)\b/g, '')
}
export function matchDietaryNeeds(dish, preferences = {}) {
  const text = normalize([dish.name, dish.description, ...(dish.listedIngredients || [])].join(' '))
    .replace(/\b(?:no|without|free from) (?:milk|cheese|butter|cream|eggs?|peanuts?|wheat|soy|sesame)\b/g, '')
    .replace(/\b(?:milk|dairy|egg|peanut|wheat|soy|sesame)[- ]free\b/g, '')
    .replace(/\b(?:vegan|plant-based|meatless) (?:beef|bacon|ham|chicken|pork)\b/g, '')
  const detected = new Map()
  for (const [group, pattern] of Object.entries(patterns)) {
    const match = (group === 'dairy' ? dairyText(text) : text).match(pattern)
    if (match) detected.set(group, match[0])
  }
  const preset = dietaryPresets[preferences.diet]
  const dietConflicts = (preset?.avoidedGroups || []).filter(group => detected.has(group)).map(group => ({ group, evidence: `Menu mentions ${detected.get(group)}.` }))
  for (const rule of preset?.incompatibleGroups || []) {
    if (detected.has(rule.with) && rule.anyOf.some(group => detected.has(group))) dietConflicts.push({ group: rule.label, evidence: 'Menu mentions both meat and dairy.' })
  }
  const mapped = { Milk: 'dairy', Dairy: 'dairy', Eggs: 'eggs', Fish: 'fish', Shellfish: 'shellfish' }
  const allergyConflicts = []
  for (const allergen of preferences.allergies || []) {
    const evidence = [
      ...((dish.possibleAllergens || []).filter(item => item.allergen === allergen).map(item => item.evidence)),
      ...(detected.has(mapped[allergen]) ? [detected.get(mapped[allergen])] : []),
      ...(allergyPatterns[allergen]?.exec(text)?.slice(0, 1) || []),
    ]
    if (evidence.length) allergyConflicts.push({ allergen, evidence: [...new Set(evidence)] })
  }
  return { dietConflicts, allergyConflicts, hasConflict: Boolean(dietConflicts.length || allergyConflicts.length) }
}
export function mergeDishAssessment(dish, preferences, assessment) {
  const local = matchDietaryNeeds(dish, preferences)
  const aiDiet = (assessment?.concerns || []).filter(item => item.restriction === preferences.diet).map(item => ({ group: item.restriction, evidence: `${item.evidence} - ${item.reasoning}` }))
  const aiAllergies = (assessment?.concerns || []).filter(item => (preferences.allergies || []).includes(item.restriction)).map(item => ({ allergen: item.restriction, evidence: `${item.evidence} - ${item.reasoning}` }))
  const dietConflicts = [...aiDiet, ...local.dietConflicts.map(item => ({ ...item, evidence: `Additional menu check: ${item.evidence}` }))]
  const allergyConflicts = [...aiAllergies, ...local.allergyConflicts.filter(item => !aiAllergies.some(ai => ai.allergen === item.allergen))]
  const hasConflict = Boolean(local.hasConflict || aiDiet.length || aiAllergies.length || assessment?.profileStatus === 'conflict')
  const recommended = Boolean(assessment && assessment.profileStatus === 'potential' && !hasConflict && preferences.allergiesAnswered === true)
  return { ...dish, matching: {
    assessed: Boolean(assessment), recommended, hasConflict, dietConflicts, allergyConflicts,
    recommendationReason: assessment?.reason || 'Gemini has not assessed this dish. Ingredients, sourcing and cross-contact remain unknown.',
    suitabilityScore: recommended ? 100 : hasConflict ? 0 : 50,
    status: hasConflict ? 'POSSIBLE CONFLICT' : assessment ? 'NEEDS CONFIRMATION' : 'NOT ASSESSED',
  } }
}
