import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useScreenFocused(): boolean {
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  return isFocused;
}
