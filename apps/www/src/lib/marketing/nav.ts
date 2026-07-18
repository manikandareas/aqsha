/** Shared landing nav targets — consumed by default + hero headers. */
export const primaryNav = [
  { href: "/#bandingin", label: "Bandingin" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#fitur", label: "Fitur" },
  { href: "/#buat-siapa", label: "Buat siapa" },
] as const;

export const secondaryNav = [
  { href: "/#pricing", label: "Harga" },
  { href: "/blog", label: "Blog" },
] as const;

export const innerNav = [
  ...primaryNav,
  ...secondaryNav,
  { href: "/changelog", label: "Apa yang baru" },
] as const;
