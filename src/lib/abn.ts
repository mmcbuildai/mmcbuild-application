export function validateAbn(value: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return "ABN must be 11 digits";
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split("").map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
  if (sum % 89 !== 0) return "Invalid ABN checksum";
  return null;
}

export function formatAbn(abn: string): string {
  const digits = abn.replace(/\s/g, "");
  if (digits.length !== 11) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

export interface AbnLookupResult {
  abn: string;
  abnStatus: string;
  entityName: string;
  entityType: string;
  acn: string;
  businessNames: string[];
  state: string;
  postcode: string;
}
