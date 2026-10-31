const names = { "zh-CN": "公开奖", en: "OpenDraw", ja: "公開くじ" };
export const brandName = (language) => names[language] || names.en;
export function renderBrand(language) {
  for (const element of document.querySelectorAll("[data-brand-name]"))
    element.textContent = brandName(language);
}
