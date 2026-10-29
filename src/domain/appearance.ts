export const themeOptions = [
  { value: 'song-porcelain-green', label: '宋瓷青绿', swatches: ['#2E6A67', '#5E8C87', '#A9C8BE', '#D7E6DB', '#F1F0E8'] },
  { value: 'bianjing-twilight', label: '汴京暮色', swatches: ['#4F6072', '#B56A58', '#D9B07C', '#8DB8A7', '#F1EADF'] },
  { value: 'rouge-warm-gray', label: '燕脂暖灰', swatches: ['#A45668', '#D59BA8', '#C7C1B5', '#E7DDD3', '#F5F0EA'] },
  { value: 'green-tile-bamboo', label: '青瓦竹影', swatches: ['#4A6460', '#7A9387', '#BFD0B8', '#DDE6D6', '#F3F1E6'] },
  { value: 'tea-smoke-beige', label: '茶烟米褐', swatches: ['#7E6554', '#A78A73', '#D4B79D', '#E9D6BE', '#F5EEE4'] },
  { value: 'sophora-yellow-stone-green', label: '槐黄石绿', swatches: ['#6C7F4F', '#C6A348', '#D9C89A', '#C6D0B0', '#F0EADB'] },
  { value: 'ink-red-gold-sand', label: '墨红金砂', swatches: ['#8C2F2D', '#3E3A39', '#9B8778', '#D1BB93', '#F0E8DC'] },
  { value: 'mist-blue-silver-gray', label: '雾蓝银灰', swatches: ['#607E95', '#A8C3D6', '#B8AEA6', '#E2D0BC', '#F3EEE8'] }
];
export const defaultTheme = 'song-porcelain-green';
const themeValues = new Set(themeOptions.map(option => option.value));
export const readStoredTheme = (userId: string) => {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const storedTheme = localStorage.getItem(`app-theme:${userId}`);
    return storedTheme && themeValues.has(storedTheme) ? storedTheme : defaultTheme;
  } catch { return defaultTheme; }
};
export const applyTheme = (theme: string) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', themeValues.has(theme)?theme:defaultTheme);
  root.setAttribute('data-theme-forced', 'true');
  root.classList.remove('dark-theme-active');
};
