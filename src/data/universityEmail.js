// Shared by sign-in, account creation, reset, and the verification preview.
export const universityEmailPattern = String.raw`[^\s@]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)+[eE][dD][uU]`
const universityEmail = new RegExp(`^(?:${universityEmailPattern})$`)
export function isUniversityEmail(value) {
  return universityEmail.test(value.trim())
}
