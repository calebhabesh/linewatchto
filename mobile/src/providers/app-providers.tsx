import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type PropsWithChildren, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/state/auth-provider";
import { CommutesProvider } from "@/state/commutes-provider";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { PushNotificationsProvider } from "@/state/push-notifications-provider";
import { SavedStationsProvider } from "@/state/saved-stations-provider";
import { TrainMarkersProvider } from "@/state/train-markers-provider";
import { ThemeProvider } from "@/theme/theme-provider";

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "linewatch.query-cache.v1",
  throttleTime: 1_000,
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          const status = error instanceof Error && "status" in error ? Number(error.status) : undefined;
          return failureCount < 2 && (status === undefined || status >= 500);
        },
        refetchOnReconnect: true,
      },
    },
  });
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const updateFocus = (state: AppStateStatus) => focusManager.setFocused(state === "active");
    const subscription = AppState.addEventListener("change", updateFocus);
    updateFocus(AppState.currentState);
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 30 * 60_000,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => query.meta?.persist === true && query.state.status === "success",
            },
          }}
        >
          <ThemeProvider>
            <AuthProvider>
              <SavedStationsProvider>
                <CommutesProvider>
                  <PushNotificationsProvider>
                    <NetworkProvider>
                      <TrainMarkersProvider>
                        <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
                      </TrainMarkersProvider>
                    </NetworkProvider>
                  </PushNotificationsProvider>
                </CommutesProvider>
              </SavedStationsProvider>
            </AuthProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
