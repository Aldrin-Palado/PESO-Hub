const pesoProfileLogo = new URL(
  "../assets/images/peso-logo-mark.png",
  import.meta.url,
).href;

export function getEmployerProfileLogo(
  logoUrl: string | null | undefined,
  isPeso: boolean | null | undefined,
): string | null {
  return isPeso ? pesoProfileLogo : logoUrl || null;
}
