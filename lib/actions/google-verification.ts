// Shared request options; authorization is decided only from the verified callback.
export const googleVerificationParameters = {
  max_age: "0",
  claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }),
  prompt: "select_account",
};
