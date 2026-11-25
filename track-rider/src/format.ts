/** Order codes are shown as the last 6 characters, e.g. #3D9E0B. */
export const shortCode = (code: string | null | undefined) => (code ?? '').slice(-6).toUpperCase();
