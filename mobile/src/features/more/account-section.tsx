import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/state/auth-provider";
import { useTheme } from "@/theme/theme-provider";

export function AccountSection() {
  const { theme } = useTheme();
  const {
    user,
    status,
    authConfig,
    login,
    register,
    demoLogin,
    devLogin,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await login({ email: email.trim(), password: password.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const response = await register({
        email: email.trim(),
        password: password.trim(),
        displayName: displayName.trim() || undefined,
      });
      setInfoMessage(response.message || "Registration link sent. Check your email.");
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await demoLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDev = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await devLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Account</Text>
        <ActivityIndicator color={theme.color.focus} size="small" />
      </View>
    );
  }

  if (status === "authenticated" && user) {
    return (
      <View
        style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
        testID="account-authenticated-section"
      >
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Account</Text>
          <View style={styles.badgeRow}>
            {user.googleLinked ? (
              <View style={[styles.badge, { backgroundColor: `${theme.color.focus}20`, borderColor: theme.color.focus }]}>
                <Text style={[styles.badgeText, { color: theme.color.focus }]}>GOOGLE LINKED</Text>
              </View>
            ) : null}
            {user.demo ? (
              <View style={[styles.badge, { backgroundColor: `${theme.line.planned}25`, borderColor: theme.line.planned }]}>
                <Text style={[styles.badgeText, { color: theme.line.planned }]}>DEMO</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border }]}>
            <Text style={[styles.avatarText, { color: theme.color.text }]}>
              {(user.displayName || user.email).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.displayName, { color: theme.color.text }]}>
              {user.displayName || "LineWatch Rider"}
            </Text>
            <Text style={[styles.email, { color: theme.color.textMuted }]}>{user.email}</Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Sign out of LineWatchTO"
          accessibilityRole="button"
          disabled={loading}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
              borderColor: theme.color.borderStrong,
            },
          ]}
          testID="account-logout-button"
        >
          {loading ? (
            <ActivityIndicator color={theme.color.text} size="small" />
          ) : (
            <Text style={[styles.actionButtonText, { color: theme.color.text }]}>Sign Out</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
      testID="account-unauthenticated-section"
    >
      <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Account</Text>
      <Text style={[styles.copy, { color: theme.color.textMuted }]}>
        Sign in to manage saved stations, commutes, and push notification preferences.
      </Text>

      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode("login");
            setError(null);
          }}
          style={[
            styles.toggleTab,
            mode === "login" && { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.focus },
            mode !== "login" && { borderColor: theme.color.border },
          ]}
          testID="account-tab-login"
        >
          <Text
            style={[
              styles.toggleTabText,
              { color: mode === "login" ? theme.color.text : theme.color.textQuiet },
            ]}
          >
            Sign In
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode("register");
            setError(null);
          }}
          style={[
            styles.toggleTab,
            mode === "register" && { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.focus },
            mode !== "register" && { borderColor: theme.color.border },
          ]}
          testID="account-tab-register"
        >
          <Text
            style={[
              styles.toggleTabText,
              { color: mode === "register" ? theme.color.text : theme.color.textQuiet },
            ]}
          >
            Create Account
          </Text>
        </Pressable>
      </View>

      {/* Error or info feedback */}
      {error ? (
        <View style={[styles.feedbackBox, { backgroundColor: `${theme.line.suspension}20`, borderColor: theme.line.suspension }]}>
          <Text style={[styles.feedbackText, { color: theme.line.suspension }]}>{error}</Text>
        </View>
      ) : null}

      {infoMessage ? (
        <View style={[styles.feedbackBox, { backgroundColor: `${theme.line.normal}20`, borderColor: theme.line.normal }]}>
          <Text style={[styles.feedbackText, { color: theme.line.normal }]}>{infoMessage}</Text>
        </View>
      ) : null}

      {/* Form Fields */}
      {mode === "register" ? (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.color.textQuiet }]}>DISPLAY NAME (OPTIONAL)</Text>
          <TextInput
            accessibilityLabel="Display Name"
            autoCapitalize="words"
            onChangeText={setDisplayName}
            placeholder="Transit Rider"
            placeholderTextColor={theme.color.textQuiet}
            style={[styles.input, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border, color: theme.color.text }]}
            testID="account-name-input"
            value={displayName}
          />
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.color.textQuiet }]}>EMAIL</Text>
        <TextInput
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="rider@example.com"
          placeholderTextColor={theme.color.textQuiet}
          style={[styles.input, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border, color: theme.color.text }]}
          testID="account-email-input"
          value={email}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.color.textQuiet }]}>PASSWORD</Text>
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.color.textQuiet}
          secureTextEntry
          style={[styles.input, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border, color: theme.color.text }]}
          testID="account-password-input"
          value={password}
        />
      </View>

      {/* Primary Submit */}
      <Pressable
        accessibilityLabel={mode === "login" ? "Sign In" : "Register"}
        accessibilityRole="button"
        disabled={loading}
        onPress={mode === "login" ? handleLogin : handleRegister}
        style={({ pressed }) => [
          styles.submitButton,
          {
            backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.focus,
            borderColor: theme.color.focus,
          },
        ]}
        testID="account-submit-button"
      >
        {loading ? (
          <ActivityIndicator color="#08090b" size="small" />
        ) : (
          <Text style={styles.submitButtonText}>
            {mode === "login" ? "Sign In" : "Create Account"}
          </Text>
        )}
      </Pressable>

      {/* Quick Demo and Dev Access */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: theme.color.border }]} />
        <Text style={[styles.dividerText, { color: theme.color.textQuiet }]}>OR QUICK ACCESS</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.color.border }]} />
      </View>

      <View style={styles.quickActionRow}>
        <Pressable
          accessibilityHint="Sign in immediately with a temporary demo account"
          accessibilityLabel="Try Demo Account"
          accessibilityRole="button"
          disabled={loading}
          onPress={handleDemo}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
              borderColor: theme.color.border,
            },
          ]}
          testID="account-demo-button"
        >
          <Text style={[styles.secondaryButtonText, { color: theme.color.text }]}>Demo Account</Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable
            accessibilityHint="Sign in as developer for local testing"
            accessibilityLabel="Developer Sign In"
            accessibilityRole="button"
            disabled={loading}
            onPress={handleDev}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                borderColor: theme.color.border,
              },
            ]}
            testID="account-dev-button"
          >
            <Text style={[styles.secondaryButtonText, { color: theme.color.focus }]}>Dev Account</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  copy: {
    fontSize: 13,
    lineHeight: 18,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "900",
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontSize: 15,
    fontWeight: "800",
  },
  email: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  toggleTab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  toggleTabText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  feedbackBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
  },
  submitButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 4,
  },
  submitButtonText: {
    color: "#08090b",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  actionButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
});
