export const ADDRESS_HISTORY_STORAGE_KEY = "quicknav-address-history-v1";
export const ADDRESS_HISTORY_LIMIT = 50;

const ADDRESS_HISTORY_VERSION = 1;
const MAX_ADDRESS_LENGTH = 500;

export interface AddressHistoryEntry {
  id: string;
  address: string;
  savedAt: number;
}

interface AddressHistoryPayload {
  version: typeof ADDRESS_HISTORY_VERSION;
  items: AddressHistoryEntry[];
}

function cleanAddress(value: string): string {
  return value.trim().slice(0, MAX_ADDRESS_LENGTH);
}

function isStoredEntry(value: unknown): value is AddressHistoryEntry {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AddressHistoryEntry>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 100 &&
    typeof candidate.address === "string" &&
    cleanAddress(candidate.address).length >= 2 &&
    candidate.address.length <= MAX_ADDRESS_LENGTH &&
    typeof candidate.savedAt === "number" &&
    Number.isFinite(candidate.savedAt) &&
    candidate.savedAt > 0
  );
}

export function readAddressHistory(serialized: string | null): AddressHistoryEntry[] {
  if (!serialized) return [];

  try {
    const payload = JSON.parse(serialized) as Partial<AddressHistoryPayload>;
    if (payload.version !== ADDRESS_HISTORY_VERSION || !Array.isArray(payload.items)) {
      return [];
    }

    const seenIds = new Set<string>();
    const items: AddressHistoryEntry[] = [];

    for (const item of payload.items) {
      if (!isStoredEntry(item) || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push({
        id: item.id,
        address: cleanAddress(item.address),
        savedAt: item.savedAt,
      });
      if (items.length === ADDRESS_HISTORY_LIMIT) break;
    }

    return items;
  } catch {
    return [];
  }
}

export function serializeAddressHistory(items: AddressHistoryEntry[]): string {
  const payload: AddressHistoryPayload = {
    version: ADDRESS_HISTORY_VERSION,
    items: items.slice(0, ADDRESS_HISTORY_LIMIT).map((item) => ({
      id: item.id,
      address: cleanAddress(item.address),
      savedAt: item.savedAt,
    })),
  };

  return JSON.stringify(payload);
}

export function addAddressHistoryEntry(
  items: AddressHistoryEntry[],
  address: string,
  savedAt = Date.now(),
  id = `${savedAt}-${Math.random().toString(36).slice(2, 10)}`,
): AddressHistoryEntry[] {
  const cleaned = cleanAddress(address);
  if (cleaned.length < 2) return items;

  const next: AddressHistoryEntry = { id, address: cleaned, savedAt };
  return [next, ...items.filter((item) => item.id !== id)].slice(
    0,
    ADDRESS_HISTORY_LIMIT,
  );
}

export function removeAddressHistoryEntry(
  items: AddressHistoryEntry[],
  id: string,
): AddressHistoryEntry[] {
  return items.filter((item) => item.id !== id);
}
