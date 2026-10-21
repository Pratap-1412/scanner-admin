type ClassValue = string | false | null | undefined | 0;

/** Joins the class names that are set. */
export const cn = (...inputs: ClassValue[]) => inputs.filter(Boolean).join(' ');
