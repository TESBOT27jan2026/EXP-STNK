/**
 * Parse an Indonesian vehicle plate ("F 3686 FIO", "B 1234 ABC") into the
 * three components Signal's API uses.
 *
 * Whitespace tolerant. Returns null on unparseable input.
 */
export interface ParsedPlate {
    area_code: string;        // e.g. "F"
    tnkb_no: string;          // e.g. "XXXX"
    serial_back_code: string; // e.g. "XXX"
}

export function parsePlate(plate: string): ParsedPlate | null {
    const m = plate.trim().toUpperCase().match(/^([A-Z]{1,2})\s*([0-9]{1,4})\s*([A-Z]{0,3})$/);
    if (!m) return null;
    const [, area_code, tnkb_no, serial_back_code] = m;
    return { area_code: area_code!, tnkb_no: tnkb_no!, serial_back_code: serial_back_code ?? '' };
}

/** Last 5 chars of a chassis number, uppercased — the form Signal expects. */
export function chassisLast5(full: string): string {
    return full.replace(/\s+/g, '').toUpperCase().slice(-5);
}
