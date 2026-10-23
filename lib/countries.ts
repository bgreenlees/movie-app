// Countries offered in the Discover filter, as ISO 3166-1 codes (what TMDB's
// with_origin_country expects). Curated to industries with enough titles on TMDB.
export const DISCOVER_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "HK", name: "Hong Kong" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

export function countryName(code: string): string {
  return DISCOVER_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function isValidCountry(code: string | null): code is string {
  return !!code && DISCOVER_COUNTRIES.some((c) => c.code === code);
}
