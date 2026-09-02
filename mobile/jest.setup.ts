import { jest } from "@jest/globals";
import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import "react-native-gesture-handler/jestSetup";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

jest.mock("react-native-worklets", () => {
  return require("react-native-worklets/src/mock");
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  return {
    ...Reanimated,
    useReducedMotion: () => false,
  };
});

jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(inset),
    useSafeAreaInsets: () => inset,
  };
});
