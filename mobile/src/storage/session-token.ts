import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "linewatch.native-session-token";

export const sessionTokenStore = {
  get: () => SecureStore.getItemAsync(SESSION_TOKEN_KEY),
  set: (token: string) =>
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
};

// The backend does not issue native bearer credentials yet. This adapter is the
// only mobile persistence seam auth work should use once that transport exists.
