export type AccountDialogMode = "login" | "register";

export type AccountCredentialInput = {
  mode: AccountDialogMode;
  email: string;
  password: string;
};

export type AccountValidationResult = {
  valid: boolean;
  normalizedEmail: string;
  message: string | null;
};

export const ACCOUNT_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

function hasLetter(value: string) {
  return /[A-Za-z]/.test(value);
}

function hasNumberSymbolOrSpace(value: string) {
  return /[\d\s]|[^A-Za-z0-9]/.test(value);
}

export function validateAccountCredentials(input: AccountCredentialInput): AccountValidationResult {
  const normalizedEmail = normalizeAccountEmail(input.email);
  const password = input.password;

  if (!ACCOUNT_EMAIL_PATTERN.test(normalizedEmail)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Enter a valid email address.",
    };
  }

  if (!password) {
    return {
      valid: false,
      normalizedEmail,
      message: "Enter a password.",
    };
  }

  if (input.mode === "login") {
    return {
      valid: true,
      normalizedEmail,
      message: null,
    };
  }

  const trimmedPassword = password.trim();
  if (trimmedPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must be at least 8 characters.",
    };
  }

  if (!hasLetter(trimmedPassword)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must include at least one letter.",
    };
  }

  if (!hasNumberSymbolOrSpace(trimmedPassword)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must include a number, symbol, or space.",
    };
  }

  return {
    valid: true,
    normalizedEmail,
    message: null,
  };
}
