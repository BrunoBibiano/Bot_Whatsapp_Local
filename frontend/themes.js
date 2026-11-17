export const baseTokens = {
  '--bg-primary': '#13111C',
  '--bg-surface': '#1E1B2E',
  '--bg-input': '#2A2640',
  '--accent-start': '#7B61FF',
  '--accent-end': '#C86DD7',
  '--btn-contrast-bg': '#FFFFFF',
  '--btn-contrast-text': '#13111C',
  '--text-primary': '#FFFFFF',
  '--text-secondary': '#8E8A9E',
  '--status-positive': '#10B981',
  '--status-negative': '#EF4444'
};
export const presets = [{
  id: 'purple',
  name: 'Crypto Purple',
  detail: 'O original. Nada básico.',
  tokens: {
    ...baseTokens
  }
}, {
  id: 'emerald',
  name: 'Emerald Finance',
  detail: 'Uma nova perspectiva.',
  tokens: {
    ...baseTokens,
    '--bg-primary': '#0B1310',
    '--bg-surface': '#13221C',
    '--bg-input': '#20382E',
    '--accent-start': '#10B981',
    '--accent-end': '#06B6D4',
    '--text-secondary': '#91AA9E'
  }
}, {
  id: 'ocean',
  name: 'Midnight Ocean',
  detail: 'Profundidade em cada detalhe.',
  tokens: {
    ...baseTokens,
    '--bg-primary': '#0B1120',
    '--bg-surface': '#151F32',
    '--bg-input': '#23304B',
    '--accent-start': '#3B82F6',
    '--accent-end': '#6366F1',
    '--text-secondary': '#939FB5'
  }
}, {
  id: 'sunset',
  name: 'Sunset Gold',
  detail: 'Para quem vê além.',
  tokens: {
    ...baseTokens,
    '--bg-primary': '#161210',
    '--bg-surface': '#241E1B',
    '--bg-input': '#382D26',
    '--accent-start': '#F59E0B',
    '--accent-end': '#EA580C',
    '--text-secondary': '#B1A195'
  }
}, {
  id: 'light',
  name: 'Clean Light Mode',
  detail: 'Clareza para o seu dia.',
  tokens: {
    ...baseTokens,
    '--bg-primary': '#F4F5F8',
    '--bg-surface': '#FFFFFF',
    '--bg-input': '#ECECF4',
    '--text-primary': '#13111C',
    '--text-secondary': '#666477',
    '--btn-contrast-bg': '#13111C',
    '--btn-contrast-text': '#FFFFFF',
    '--status-positive': '#087A56',
    '--status-negative': '#C22C3C'
  }
}];
export function validHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}
export function loadTheme(storage) {
  try {
    const value = JSON.parse(storage.getItem('whatsapp-theme'));
    if (!value || typeof value.tokens !== 'object' || value.tokens === null) return {
      id: 'purple',
      tokens: {
        ...baseTokens
      }
    };
    const tokens = {
      ...baseTokens
    };
    for (const key of Object.keys(baseTokens)) if (validHex(value.tokens[key])) tokens[key] = value.tokens[key];
    const preset = presets.find(p => p.id === value.id);
    const matches = preset && Object.keys(baseTokens).every(key => preset.tokens[key] === tokens[key]);
    return {
      id: matches ? preset.id : 'custom',
      tokens
    };
  } catch {
    return {
      id: 'purple',
      tokens: {
        ...baseTokens
      }
    };
  }
}
