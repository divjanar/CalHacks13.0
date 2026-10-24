const crypto = require('node:crypto');

function menuItem(venue, name, description, price, section = '') {
  const id = crypto.createHash('sha256').update(JSON.stringify([venue.id, section, name])).digest('hex').slice(0, 24);
  return { id, sourceItemId: id, name, description, price, section,
    evidence: [name, description, price].filter(Boolean).join('\n'), listedIngredients: [], possibleAllergens: [] };
}

// Makai publishes a designed, three-column PDF. Reading the page as a single
// string interleaves neighboring dishes. Keep each column's geometry instead.
async function readColumnPdf(bytes, venue, pages) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true }).promise;
  const result = [];
  try {
    for (const pageNumber of [2, 3]) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const words = content.items.filter(word => word.str?.trim()).map(word => ({
        text: word.str.trim(), x: word.transform[4], y: word.transform[5],
        size: Math.abs(word.transform[0]), width: word.width, font: word.fontName,
      }));
      const priceFonts = new Map();
      for (const word of words.filter(word => /^\d+(?:\/\d+)?$/.test(word.text))) {
        priceFonts.set(word.font, (priceFonts.get(word.font) || 0) + 1);
      }
      const titleFont = [...priceFonts].sort((a, b) => b[1] - a[1])[0]?.[0];
      for (let column = 0; column < 3; column++) {
        const columnWords = words.filter(word => Math.min(2, Math.floor((word.x + word.width / 2) / (page.view[2] / 3))) === column)
          .sort((a, b) => Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y);
        const titles = columnWords.filter(word => word.size >= 8.5 && word.size < 11 && word.font === titleFont && /[a-z]/i.test(word.text));
        // Pupu Platter is set in the display face, unlike the other dish titles.
        titles.push(...columnWords.filter(word => word.text === 'Pupu Platter'));
        titles.sort((a, b) => b.y - a.y);
        const groups = [];
        for (const title of titles) {
          const previous = groups.at(-1);
          if (previous && previous.bottom - title.y < 20) {
            previous.name += ' ' + title.text;
            previous.bottom = title.y;
          } else groups.push({ name: title.text, top: title.y, bottom: title.y });
        }
        for (let i = 0; i < groups.length; i++) {
          const title = groups[i];
          const body = columnWords.filter(word => word.y < title.bottom - 2 && word.y > (groups[i + 1]?.top ?? 60) + 2 && word.size < 11 && word.size >= (title.name === 'Pupu Platter' ? 7.5 : 8));
          const prices = body.filter(word => /^\d+(?:\/\d+)?$/.test(word.text));
          const description = body.map(word => word.text).join(' ').replace(/-\s+/g, '-');
          result.push(menuItem(venue, title.name, description, prices.map(word => '$' + word.text).join(' / '), pageNumber === 2 ? 'Pupus, soup and salads' : 'Entrees'));
        }
      }
    }
    const lines = (pages[3]?.text || '').split('\n').map(line => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(.+?)\s+-\s+(\d+)$/);
      if (!match) continue;
      let name = match[1];
      // Two beverage groups wrap onto the preceding lines.
      if (/^(Ginger Beer|Guava Juice)/.test(name)) {
        let before = i - 1;
        while (before >= 0 && /[, &]$/.test(lines[before])) name = lines[before--] + ' ' + name;
      }
      const description = /^(with |Coconut or )/.test(lines[i + 1] || '') ? lines[i + 1] : '';
      result.push(menuItem(venue, name, description, '$' + match[2], 'Sides, drinks and desserts'));
    }
  } finally { await document.destroy(); }
  return result;
}

module.exports = { menuItem, readColumnPdf };
